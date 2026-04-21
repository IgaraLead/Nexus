package peer

import (
	"fmt"
	"log/slog"
	"sync"

	"github.com/pion/interceptor"
	"github.com/pion/webrtc/v4"

	"github.com/chatwoot/chatwoot-media-server/internal/config"
)

// PeerRole defines the role of an agent peer in a call session.
type PeerRole string

const (
	// RoleActive indicates the peer sends and receives audio (the primary agent).
	RoleActive PeerRole = "active"

	// RoleListenOnly indicates the peer receives audio but does not send
	// (supervisory monitoring).
	RoleListenOnly PeerRole = "listen_only"

	// RoleInjectOnly indicates the peer sends audio but does not receive
	// (audio injection source).
	RoleInjectOnly PeerRole = "inject_only"
)

// AgentPeer represents the WebRTC peer connection to an agent's browser
// (Peer B). The media server creates an SDP offer for the agent; the browser
// responds with an SDP answer to complete the handshake.
type AgentPeer struct {
	ID   string
	Role PeerRole

	pc         *webrtc.PeerConnection
	audioTrack *webrtc.TrackRemote
	localTrack *webrtc.TrackLocalStaticRTP
	sender     *webrtc.RTPSender

	// onTrackReady is called when the agent's audio track becomes available.
	onTrackReady func(track *webrtc.TrackRemote)

	// onICEStateChange is called when the ICE connection state changes.
	onICEStateChange func(state webrtc.ICEConnectionState)

	mu     sync.Mutex
	closed bool
}

// NewAgentPeer creates a new agent-side peer connection and generates an SDP
// offer to send to the agent's browser. The browser will respond with an SDP
// answer via SetAnswer. The returned string is the SDP offer.
func NewAgentPeer(cfg *config.Config, id string, role PeerRole, iceServers []webrtc.ICEServer) (*AgentPeer, string, error) {
	se := webrtc.SettingEngine{}

	if err := se.SetEphemeralUDPPortRange(cfg.UDPPortMin, cfg.UDPPortMax); err != nil {
		return nil, "", fmt.Errorf("set UDP port range: %w", err)
	}

	// NOTE: In pion/webrtc v4.2+, migrate to SetICEAddressRewriteRules.
	if cfg.PublicIP != "" {
		se.SetNAT1To1IPs([]string{cfg.PublicIP}, webrtc.ICECandidateTypeSrflx)
	}

	me := &webrtc.MediaEngine{}
	if err := me.RegisterDefaultCodecs(); err != nil {
		return nil, "", fmt.Errorf("register codecs: %w", err)
	}

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

	// Create the local audio track that carries customer audio (from Meta)
	// to the agent's browser.
	localTrack, err := webrtc.NewTrackLocalStaticRTP(
		webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeOpus},
		"audio-to-agent",
		"chatwoot-media-server",
	)
	if err != nil {
		pc.Close()
		return nil, "", fmt.Errorf("create local track: %w", err)
	}

	// Bind the local track to a sendrecv transceiver so the offer advertises
	// both directions: we send customer audio to the browser, and we expect
	// the browser's microphone audio back. AddTrack alone yields a sendonly
	// m=audio, leaving the browser with nowhere to send mic audio.
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

	ap := &AgentPeer{
		ID:         id,
		Role:       role,
		pc:         pc,
		localTrack: localTrack,
		sender:     sender,
	}

	// Register the OnTrack handler to capture the agent's microphone audio.
	pc.OnTrack(func(track *webrtc.TrackRemote, receiver *webrtc.RTPReceiver) {
		slog.Info("agent peer: remote track received",
			"peer_id", id,
			"codec", track.Codec().MimeType,
			"ssrc", track.SSRC(),
		)
		ap.mu.Lock()
		ap.audioTrack = track
		cb := ap.onTrackReady
		ap.mu.Unlock()

		if cb != nil {
			cb(track)
		}
	})

	// Register ICE connection state handler.
	pc.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		slog.Info("agent peer: ICE state changed",
			"peer_id", id,
			"state", state.String(),
		)
		ap.mu.Lock()
		cb := ap.onICEStateChange
		ap.mu.Unlock()

		if cb != nil {
			cb(state)
		}
	})

	// Create an SDP offer for the agent's browser.
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

	sdpOffer := pc.LocalDescription().SDP

	return ap, sdpOffer, nil
}

// SetAnswer sets the agent browser's SDP answer on the peer connection,
// completing the WebRTC handshake.
func (ap *AgentPeer) SetAnswer(sdpAnswer string) error {
	ap.mu.Lock()
	defer ap.mu.Unlock()

	answer := webrtc.SessionDescription{
		Type: webrtc.SDPTypeAnswer,
		SDP:  sdpAnswer,
	}
	return ap.pc.SetRemoteDescription(answer)
}

// AudioTrack returns the remote audio track from the agent's browser.
// Returns nil if the track has not been received yet.
func (ap *AgentPeer) AudioTrack() *webrtc.TrackRemote {
	ap.mu.Lock()
	defer ap.mu.Unlock()
	return ap.audioTrack
}

// LocalTrack returns the local RTP track used to send audio to the agent.
func (ap *AgentPeer) LocalTrack() *webrtc.TrackLocalStaticRTP {
	return ap.localTrack
}

// OnTrackReady sets a callback that fires when the agent's microphone audio
// track becomes available.
func (ap *AgentPeer) OnTrackReady(fn func(track *webrtc.TrackRemote)) {
	ap.mu.Lock()
	defer ap.mu.Unlock()
	ap.onTrackReady = fn
}

// OnICEStateChange sets a callback that fires when the ICE connection state
// changes.
func (ap *AgentPeer) OnICEStateChange(fn func(state webrtc.ICEConnectionState)) {
	ap.mu.Lock()
	defer ap.mu.Unlock()
	ap.onICEStateChange = fn
}

// ICEConnectionState returns the current ICE connection state.
func (ap *AgentPeer) ICEConnectionState() webrtc.ICEConnectionState {
	return ap.pc.ICEConnectionState()
}

// Close gracefully shuts down the agent-side peer connection.
func (ap *AgentPeer) Close() error {
	ap.mu.Lock()
	defer ap.mu.Unlock()

	if ap.closed {
		return nil
	}
	ap.closed = true

	slog.Info("agent peer: closing peer connection", "peer_id", ap.ID)
	return ap.pc.Close()
}
