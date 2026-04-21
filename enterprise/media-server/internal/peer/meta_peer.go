// Package peer provides WebRTC peer connection wrappers for the two sides
// of a call: the Meta-side peer (Peer A) and the Agent-side peer (Peer B).
package peer

import (
	"context"
	"fmt"
	"log/slog"
	"runtime/debug"
	"sync"
	"time"

	"github.com/pion/interceptor"
	"github.com/pion/webrtc/v4"

	"github.com/chatwoot/chatwoot-media-server/internal/config"
)

// MetaPeer represents the WebRTC peer connection to Meta's media servers
// (Peer A). It receives the customer's audio as an incoming remote track and
// sends the agent's audio via a local static RTP track.
type MetaPeer struct {
	pc         *webrtc.PeerConnection
	audioTrack *webrtc.TrackRemote
	localTrack *webrtc.TrackLocalStaticRTP
	sender     *webrtc.RTPSender

	// onTrackReady is called when the remote audio track from Meta is available.
	onTrackReady func(track *webrtc.TrackRemote)

	// onICEStateChange is called when the ICE connection state changes.
	onICEStateChange func(state webrtc.ICEConnectionState)

	mu     sync.Mutex
	closed bool
}

// NewMetaPeer creates a new Meta-side peer connection configured for the
// given ICE servers and UDP port range. For incoming calls, sdpOffer contains
// Meta's SDP offer; the method sets it as the remote description, creates an
// answer, and returns the SDP answer string. For outgoing calls, sdpOffer is
// empty; the method creates an SDP offer to send to Meta.
func NewMetaPeer(cfg *config.Config, sdpOffer string, iceServers []webrtc.ICEServer) (*MetaPeer, string, error) {
	se := webrtc.SettingEngine{}

	// Configure the UDP port range for media transport.
	if err := se.SetEphemeralUDPPortRange(cfg.UDPPortMin, cfg.UDPPortMax); err != nil {
		return nil, "", fmt.Errorf("set UDP port range: %w", err)
	}

	// Meta's side finishes setting up our DTLS credentials only *after* Rails
	// calls pre_accept_call / accept_call on the Graph API. For inbound calls
	// that happens ~1 second after we've already begun the DTLS handshake, so
	// our first ClientHello is dropped. Extend the handshake window to 30s and
	// tighten the retransmission interval so a later retry lands once Meta is
	// ready.
	se.SetDTLSConnectContextMaker(func() (context.Context, func()) {
		return context.WithTimeout(context.Background(), 30*time.Second)
	})
	se.SetDTLSRetransmissionInterval(200 * time.Millisecond)

	// If a public IP is configured, use NAT1To1 so ICE candidates advertise
	// the correct address instead of a private Docker/container IP.
	// NOTE: In pion/webrtc v4.2+, migrate to SetICEAddressRewriteRules.
	if cfg.PublicIP != "" {
		se.SetNAT1To1IPs([]string{cfg.PublicIP}, webrtc.ICECandidateTypeSrflx)
	}

	// Build the WebRTC API with a media engine that supports Opus audio.
	me := &webrtc.MediaEngine{}
	if err := me.RegisterDefaultCodecs(); err != nil {
		return nil, "", fmt.Errorf("register codecs: %w", err)
	}

	// Register default interceptors (NACK, RTCP reports, etc.).
	ir := &interceptor.Registry{}
	if err := webrtc.RegisterDefaultInterceptors(me, ir); err != nil {
		return nil, "", fmt.Errorf("register interceptors: %w", err)
	}

	api := webrtc.NewAPI(
		webrtc.WithMediaEngine(me),
		webrtc.WithSettingEngine(se),
		webrtc.WithInterceptorRegistry(ir),
	)

	pc, err := api.NewPeerConnection(webrtc.Configuration{
		ICEServers: iceServers,
	})
	if err != nil {
		return nil, "", fmt.Errorf("create peer connection: %w", err)
	}

	// Create a local audio track that will carry the agent's audio to Meta.
	localTrack, err := webrtc.NewTrackLocalStaticRTP(
		webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeOpus},
		"audio-to-meta",
		"chatwoot-media-server",
	)
	if err != nil {
		pc.Close()
		return nil, "", fmt.Errorf("create local track: %w", err)
	}

	// Bind the local track to a single sendrecv transceiver. Using AddTrack +
	// a separate recvonly transceiver yields two m=audio sections, which Meta
	// rejects with error 100 "Invalid parameter".
	transceiver, err := pc.AddTransceiverFromTrack(localTrack, webrtc.RTPTransceiverInit{
		Direction: webrtc.RTPTransceiverDirectionSendrecv,
	})
	if err != nil {
		pc.Close()
		return nil, "", fmt.Errorf("add audio transceiver: %w", err)
	}
	sender := transceiver.Sender()

	// Consume RTCP packets from the sender to avoid blocking.
	go func() {
		buf := make([]byte, 1500)
		for {
			if _, _, rtcpErr := sender.Read(buf); rtcpErr != nil {
				return
			}
		}
	}()

	mp := &MetaPeer{
		pc:         pc,
		localTrack: localTrack,
		sender:     sender,
	}

	// Register the OnTrack handler to capture the incoming audio from Meta.
	pc.OnTrack(func(track *webrtc.TrackRemote, receiver *webrtc.RTPReceiver) {
		slog.Info("meta peer: remote track received",
			"codec", track.Codec().MimeType,
			"ssrc", track.SSRC(),
		)
		mp.mu.Lock()
		mp.audioTrack = track
		cb := mp.onTrackReady
		mp.mu.Unlock()

		if cb != nil {
			cb(track)
		}
	})

	// Register ICE connection state handler.
	pc.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		slog.Info("meta peer: ICE state changed", "state", state.String())
		mp.mu.Lock()
		cb := mp.onICEStateChange
		mp.mu.Unlock()

		if cb != nil {
			cb(state)
		}
	})

	// Log overall peer connection state (covers DTLS + ICE + signaling).
	// This catches failures that don't surface via ICEConnectionState alone,
	// such as DTLS handshake errors.
	pc.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		slog.Info("meta peer: connection state changed", "state", state.String())
	})
	pc.OnSignalingStateChange(func(state webrtc.SignalingState) {
		slog.Debug("meta peer: signaling state changed", "state", state.String())
	})

	// Also log DTLS transport state — failure here is the likely cause of the
	// inbound "closed immediately after ICE connected" symptom.
	if t := pc.SCTP().Transport(); t != nil {
		t.OnStateChange(func(state webrtc.DTLSTransportState) {
			slog.Info("meta peer: DTLS state changed", "state", state.String())
		})
	}

	// Perform SDP negotiation based on call direction.
	var sdpResult string
	if sdpOffer != "" {
		// Incoming call: Meta sent an offer, we generate an answer.
		offer := webrtc.SessionDescription{
			Type: webrtc.SDPTypeOffer,
			SDP:  sdpOffer,
		}
		if err := pc.SetRemoteDescription(offer); err != nil {
			pc.Close()
			return nil, "", fmt.Errorf("set remote description (Meta offer): %w", err)
		}

		answer, err := pc.CreateAnswer(nil)
		if err != nil {
			pc.Close()
			return nil, "", fmt.Errorf("create answer: %w", err)
		}

		// Wait for ICE gathering to complete before returning the answer.
		gatherComplete := webrtc.GatheringCompletePromise(pc)
		if err := pc.SetLocalDescription(answer); err != nil {
			pc.Close()
			return nil, "", fmt.Errorf("set local description: %w", err)
		}
		<-gatherComplete

		sdpResult = pc.LocalDescription().SDP
	} else {
		// Outgoing call: we generate an offer to send to Meta. The sendrecv
		// transceiver registered above already advertises both directions.
		offer, err := pc.CreateOffer(nil)
		if err != nil {
			pc.Close()
			return nil, "", fmt.Errorf("create offer: %w", err)
		}

		gatherComplete := webrtc.GatheringCompletePromise(pc)
		if err := pc.SetLocalDescription(offer); err != nil {
			pc.Close()
			return nil, "", fmt.Errorf("set local description: %w", err)
		}
		<-gatherComplete

		sdpResult = pc.LocalDescription().SDP
	}

	return mp, sdpResult, nil
}

// SetRemoteAnswer sets Meta's SDP answer on the peer connection, used for
// outbound calls when Meta responds with an answer.
func (mp *MetaPeer) SetRemoteAnswer(sdpAnswer string) error {
	mp.mu.Lock()
	defer mp.mu.Unlock()

	answer := webrtc.SessionDescription{
		Type: webrtc.SDPTypeAnswer,
		SDP:  sdpAnswer,
	}
	return mp.pc.SetRemoteDescription(answer)
}

// AudioTrack returns the remote audio track from Meta (customer audio).
// Returns nil if the track has not been received yet.
func (mp *MetaPeer) AudioTrack() *webrtc.TrackRemote {
	mp.mu.Lock()
	defer mp.mu.Unlock()
	return mp.audioTrack
}

// LocalTrack returns the local RTP track used to send audio to Meta.
func (mp *MetaPeer) LocalTrack() *webrtc.TrackLocalStaticRTP {
	return mp.localTrack
}

// OnTrackReady sets a callback that fires when the remote audio track from
// Meta becomes available.
func (mp *MetaPeer) OnTrackReady(fn func(track *webrtc.TrackRemote)) {
	mp.mu.Lock()
	defer mp.mu.Unlock()
	mp.onTrackReady = fn
}

// OnICEStateChange sets a callback that fires when the ICE connection state
// changes.
func (mp *MetaPeer) OnICEStateChange(fn func(state webrtc.ICEConnectionState)) {
	mp.mu.Lock()
	defer mp.mu.Unlock()
	mp.onICEStateChange = fn
}

// ICEConnectionState returns the current ICE connection state.
func (mp *MetaPeer) ICEConnectionState() webrtc.ICEConnectionState {
	return mp.pc.ICEConnectionState()
}

// Close gracefully shuts down the Meta-side peer connection.
func (mp *MetaPeer) Close() error {
	mp.mu.Lock()
	defer mp.mu.Unlock()

	if mp.closed {
		return nil
	}
	mp.closed = true

	slog.Info("meta peer: closing peer connection (explicit)", "stack", string(debug.Stack()))
	return mp.pc.Close()
}
