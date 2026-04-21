// Package session manages call session lifecycles, coordinating between the
// Meta-side peer, agent-side peers, audio bridge, and recording.
package session

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/pion/webrtc/v4"

	"github.com/chatwoot/chatwoot-media-server/internal/callback"
	"github.com/chatwoot/chatwoot-media-server/internal/config"
	"github.com/chatwoot/chatwoot-media-server/internal/media"
	"github.com/chatwoot/chatwoot-media-server/internal/peer"
)

// Status represents the current state of a call session.
type Status string

const (
	StatusCreated           Status = "created"
	StatusMetaConnected     Status = "meta_connected"
	StatusAgentConnected    Status = "agent_connected"
	StatusActive            Status = "active"
	StatusAgentDisconnected Status = "agent_disconnected"
	StatusTerminated        Status = "terminated"
)

// Session represents a single active call, holding the Meta-side peer
// connection (Peer A), one or more agent-side peer connections (Peer B),
// the audio bridge, and the recording engine.
type Session struct {
	ID        string
	CallID    string
	AccountID string
	Direction string // "incoming" or "outgoing"

	MetaPeer   *peer.MetaPeer
	AgentPeers map[string]*peer.AgentPeer
	Bridge     *media.Bridge
	Recorder   *media.Recorder
	Injectors  map[string]*media.Injector

	Status    Status
	StartedAt time.Time
	CreatedAt time.Time

	config         *config.Config
	railsClient    *callback.RailsClient
	reconnectTimer *time.Timer
	cancel         context.CancelFunc
	ctx            context.Context

	mu sync.Mutex
}

// Info is the JSON-serializable representation of a session's current state,
// returned by the GET /sessions/:id endpoint.
type Info struct {
	ID              string `json:"id"`
	CallID          string `json:"call_id"`
	AccountID       string `json:"account_id"`
	Direction       string `json:"direction"`
	Status          string `json:"status"`
	MetaICEState    string `json:"meta_ice_state"`
	AgentPeerCount  int    `json:"agent_peer_count"`
	DurationSeconds int    `json:"duration_seconds"`
	HasRecording    bool   `json:"has_recording"`
	CreatedAt       string `json:"created_at"`
}

// NewSession creates a new call session. For incoming calls, the Meta SDP
// offer is provided and the method returns the SDP answer. For outgoing calls,
// the Meta SDP offer is empty and the method returns an SDP offer to send to
// Meta.
func NewSession(
	cfg *config.Config,
	railsClient *callback.RailsClient,
	id, callID, accountID, direction, metaSDPOffer string,
	iceServers []webrtc.ICEServer,
) (*Session, string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), cfg.MaxSessionDuration)

	sess := &Session{
		ID:         id,
		CallID:     callID,
		AccountID:  accountID,
		Direction:  direction,
		AgentPeers: make(map[string]*peer.AgentPeer),
		Injectors:  make(map[string]*media.Injector),
		Status:     StatusCreated,
		CreatedAt:  time.Now(),
		config:     cfg,
		railsClient: railsClient,
		ctx:        ctx,
		cancel:     cancel,
	}

	// Create the Meta-side peer connection (Peer A).
	metaPeer, sdpResult, err := peer.NewMetaPeer(cfg, metaSDPOffer, iceServers)
	if err != nil {
		cancel()
		return nil, "", fmt.Errorf("create meta peer: %w", err)
	}
	sess.MetaPeer = metaPeer

	// Create the recorder.
	recorder, err := media.NewRecorder(id, cfg.RecordingsDir)
	if err != nil {
		metaPeer.Close()
		cancel()
		return nil, "", fmt.Errorf("create recorder: %w", err)
	}
	sess.Recorder = recorder

	// Create the audio bridge.
	sess.Bridge = media.NewBridge(id, metaPeer, recorder)

	// Wire up Meta peer event handlers.
	metaPeer.OnICEStateChange(func(state webrtc.ICEConnectionState) {
		sess.handleMetaICEStateChange(state)
	})

	metaPeer.OnTrackReady(func(track *webrtc.TrackRemote) {
		slog.Info("session: Meta audio track ready, starting bridge forwarding",
			"session_id", id,
		)
		// Start forwarding Meta audio to agents in its own goroutine.
		go sess.Bridge.ReadAndForwardMetaTrack(sess.ctx, track)
	})

	// Start the max duration timer.
	go func() {
		<-ctx.Done()
		sess.mu.Lock()
		if sess.Status != StatusTerminated {
			sess.mu.Unlock()
			slog.Info("session: max duration reached, terminating",
				"session_id", id,
			)
			sess.Terminate("max_duration_exceeded")
		} else {
			sess.mu.Unlock()
		}
	}()

	return sess, sdpResult, nil
}

// SetMetaAnswer sets Meta's SDP answer on the Meta peer connection. This is
// used for outbound calls when Meta responds to the server's SDP offer.
func (s *Session) SetMetaAnswer(sdpAnswer string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.MetaPeer.SetRemoteAnswer(sdpAnswer); err != nil {
		return fmt.Errorf("set meta answer: %w", err)
	}
	return nil
}

// CreateAgentPeer creates a new agent-side peer connection (Peer B) and
// returns the SDP offer to send to the agent's browser.
func (s *Session) CreateAgentPeer(peerID string, role peer.PeerRole, iceServers []webrtc.ICEServer) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	agentPeer, sdpOffer, err := peer.NewAgentPeer(s.config, peerID, role, iceServers)
	if err != nil {
		return "", fmt.Errorf("create agent peer: %w", err)
	}

	// Wire up agent peer event handlers.
	agentPeer.OnICEStateChange(func(state webrtc.ICEConnectionState) {
		s.handleAgentICEStateChange(peerID, state)
	})

	agentPeer.OnTrackReady(func(track *webrtc.TrackRemote) {
		slog.Info("session: agent audio track ready, starting bridge forwarding",
			"session_id", s.ID,
			"peer_id", peerID,
		)
		go s.Bridge.ReadAndForwardAgentTrack(s.ctx, agentPeer, track)
	})

	s.AgentPeers[peerID] = agentPeer
	s.Bridge.AddAgentPeer(agentPeer)

	// Start the bridge if Meta is already connected.
	if s.Status == StatusMetaConnected || s.Status == StatusAgentDisconnected {
		s.Bridge.Start(s.ctx)
		s.Status = StatusAgentConnected
	}

	// Cancel any active reconnect timer.
	if s.reconnectTimer != nil {
		s.reconnectTimer.Stop()
		s.reconnectTimer = nil
	}

	return sdpOffer, nil
}

// SoleAgentPeerID returns the peer_id when the session has exactly one agent
// peer. Used by the agent-answer handler as a fallback for clients that don't
// track peer ids.
func (s *Session) SoleAgentPeerID() (string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(s.AgentPeers) != 1 {
		return "", false
	}
	for id := range s.AgentPeers {
		return id, true
	}
	return "", false
}

// SetAgentAnswer sets the agent browser's SDP answer on the specified agent
// peer, completing the WebRTC handshake.
func (s *Session) SetAgentAnswer(peerID, sdpAnswer string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	ap, ok := s.AgentPeers[peerID]
	if !ok {
		return fmt.Errorf("agent peer %s not found", peerID)
	}

	if err := ap.SetAnswer(sdpAnswer); err != nil {
		return fmt.Errorf("set agent answer: %w", err)
	}

	return nil
}

// ReconnectAgent tears down the old agent peer connection and creates a new
// one, returning a fresh SDP offer. This is used when the agent reloads the
// page and needs to re-establish their peer connection while the Meta-side
// connection stays alive.
func (s *Session) ReconnectAgent(oldPeerID, newPeerID string, role peer.PeerRole, iceServers []webrtc.ICEServer) (string, error) {
	s.mu.Lock()
	// Remove the old agent peer from the session if it exists.
	var oldPeer *peer.AgentPeer
	if ap, ok := s.AgentPeers[oldPeerID]; ok {
		oldPeer = ap
		s.Bridge.RemoveAgentPeer(oldPeerID)
		delete(s.AgentPeers, oldPeerID)
	}
	s.mu.Unlock()

	// Close outside the lock to avoid deadlock from ICE state callbacks.
	if oldPeer != nil {
		oldPeer.Close()
	}

	// Create a new agent peer.
	return s.CreateAgentPeer(newPeerID, role, iceServers)
}

// Terminate gracefully ends the call session. It closes all peer connections,
// finalizes the recording, and sends callbacks to Rails.
func (s *Session) Terminate(reason string) {
	s.mu.Lock()
	if s.Status == StatusTerminated {
		s.mu.Unlock()
		return
	}
	s.Status = StatusTerminated

	// Collect injectors and agent peers while holding the lock, then release
	// before calling Close(). PeerConnection.Close() may fire ICE state
	// callbacks synchronously, which would deadlock if we held s.mu.
	injectors := make([]*media.Injector, 0, len(s.Injectors))
	for _, inj := range s.Injectors {
		injectors = append(injectors, inj)
	}

	agentPeers := make([]*peer.AgentPeer, 0, len(s.AgentPeers))
	for id, ap := range s.AgentPeers {
		agentPeers = append(agentPeers, ap)
		delete(s.AgentPeers, id)
	}

	metaPeer := s.MetaPeer
	s.mu.Unlock()

	slog.Info("session: terminating",
		"session_id", s.ID,
		"reason", reason,
	)

	// Stop the bridge.
	s.Bridge.Stop()

	// Stop any active injectors.
	for _, inj := range injectors {
		inj.Stop()
	}

	// Close all agent peers (may trigger ICE state callbacks).
	for _, ap := range agentPeers {
		ap.Close()
	}

	// Close Meta peer.
	if metaPeer != nil {
		metaPeer.Close()
	}

	// Finalize recording.
	if s.Recorder != nil {
		if err := s.Recorder.Finalize(); err != nil {
			slog.Error("session: failed to finalize recording",
				"session_id", s.ID,
				"error", err,
			)
		}
	}

	// Cancel the session context.
	if s.cancel != nil {
		s.cancel()
	}

	// Notify Rails.
	s.sendTerminationCallbacks(reason)
}

// RemoveAgentPeer removes a specific agent peer from the session.
func (s *Session) RemoveAgentPeer(peerID string) error {
	s.mu.Lock()
	ap, ok := s.AgentPeers[peerID]
	if !ok {
		s.mu.Unlock()
		return fmt.Errorf("agent peer %s not found", peerID)
	}

	s.Bridge.RemoveAgentPeer(peerID)
	delete(s.AgentPeers, peerID)
	s.mu.Unlock()

	// Close outside the lock to avoid deadlock from ICE state callbacks.
	ap.Close()
	return nil
}

// ChangeAgentRole changes the role of a connected agent peer.
func (s *Session) ChangeAgentRole(peerID string, newRole peer.PeerRole) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	ap, ok := s.AgentPeers[peerID]
	if !ok {
		return fmt.Errorf("agent peer %s not found", peerID)
	}

	ap.Role = newRole
	return nil
}

// GetInfo returns a snapshot of the session's current state.
func (s *Session) GetInfo() Info {
	s.mu.Lock()
	defer s.mu.Unlock()

	info := Info{
		ID:             s.ID,
		CallID:         s.CallID,
		AccountID:      s.AccountID,
		Direction:      s.Direction,
		Status:         string(s.Status),
		AgentPeerCount: len(s.AgentPeers),
		HasRecording:   s.Recorder != nil,
		CreatedAt:      s.CreatedAt.UTC().Format(time.RFC3339),
	}

	if s.MetaPeer != nil {
		info.MetaICEState = s.MetaPeer.ICEConnectionState().String()
	}

	if !s.StartedAt.IsZero() {
		info.DurationSeconds = int(time.Since(s.StartedAt).Seconds())
	}

	return info
}

// RecordingFilePath returns the path to the combined recording file.
func (s *Session) RecordingFilePath() string {
	if s.Recorder == nil {
		return ""
	}
	return s.Recorder.CombinedFilePath()
}

// RecorderCustomerPath returns the path to the customer-only recording.
func (s *Session) RecorderCustomerPath() string {
	if s.Recorder == nil {
		return ""
	}
	return s.Recorder.CustomerFilePath()
}

// RecorderAgentPath returns the path to the agent-only recording.
func (s *Session) RecorderAgentPath() string {
	if s.Recorder == nil {
		return ""
	}
	return s.Recorder.AgentFilePath()
}

// GetInjectorTarget returns the appropriate write target for audio injection
// based on the target parameter. Returns nil if the target is unavailable.
func (s *Session) GetInjectorTarget(target string) media.InjectorTarget {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.MetaPeer == nil {
		return nil
	}
	// All injection targets currently route to the Meta peer's local track.
	return s.MetaPeer.LocalTrack()
}

// AddInjector registers an active injector with the session in a thread-safe manner.
func (s *Session) AddInjector(id string, inj *media.Injector) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Injectors[id] = inj
}

// StopInjector stops and removes an injector by ID. Returns an error if not found.
func (s *Session) StopInjector(id string) error {
	s.mu.Lock()
	inj, ok := s.Injectors[id]
	if !ok {
		s.mu.Unlock()
		return fmt.Errorf("injector %s not found", id)
	}
	delete(s.Injectors, id)
	s.mu.Unlock()

	inj.Stop()
	return nil
}

func (s *Session) handleMetaICEStateChange(state webrtc.ICEConnectionState) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.Status == StatusTerminated {
		return
	}

	switch state {
	case webrtc.ICEConnectionStateConnected:
		if s.Status == StatusCreated {
			s.Status = StatusMetaConnected
			s.StartedAt = time.Now()
			slog.Info("session: Meta peer connected",
				"session_id", s.ID,
			)
		}

	case webrtc.ICEConnectionStateFailed, webrtc.ICEConnectionStateDisconnected:
		slog.Warn("session: Meta peer disconnected/failed",
			"session_id", s.ID,
			"state", state.String(),
		)
		// Meta disconnecting means the call is over.
		go s.Terminate("meta_disconnected")

	case webrtc.ICEConnectionStateClosed:
		slog.Info("session: Meta peer closed", "session_id", s.ID)
	}
}

func (s *Session) handleAgentICEStateChange(peerID string, state webrtc.ICEConnectionState) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.Status == StatusTerminated {
		return
	}

	switch state {
	case webrtc.ICEConnectionStateConnected:
		slog.Info("session: agent peer connected",
			"session_id", s.ID,
			"peer_id", peerID,
		)
		if s.Status == StatusMetaConnected || s.Status == StatusAgentDisconnected {
			s.Status = StatusActive
			// Start bridge if not already running.
			s.Bridge.Start(s.ctx)
		}

	case webrtc.ICEConnectionStateFailed, webrtc.ICEConnectionStateDisconnected:
		slog.Warn("session: agent peer disconnected/failed",
			"session_id", s.ID,
			"peer_id", peerID,
			"state", state.String(),
		)

		// Check if any other agent peers are still connected.
		hasConnected := false
		for id, ap := range s.AgentPeers {
			if id != peerID && ap.ICEConnectionState() == webrtc.ICEConnectionStateConnected {
				hasConnected = true
				break
			}
		}

		if !hasConnected && s.Status != StatusTerminated {
			s.Status = StatusAgentDisconnected

			// Start reconnect timer.
			s.reconnectTimer = time.AfterFunc(s.config.ReconnectTimeout, func() {
				slog.Info("session: reconnect timeout expired, terminating",
					"session_id", s.ID,
				)
				s.Terminate("agent_reconnect_timeout")
			})

			// Notify Rails of agent disconnect.
			go func() {
				if s.railsClient != nil {
					err := s.railsClient.NotifyAgentDisconnected(context.Background(), callback.AgentDisconnectedPayload{
						SessionID: s.ID,
						CallID:    s.CallID,
						Reason:    state.String(),
					})
					if err != nil {
						slog.Error("session: failed to notify Rails of agent disconnect",
							"session_id", s.ID,
							"error", err,
						)
					}
				}
			}()
		}

	case webrtc.ICEConnectionStateClosed:
		slog.Info("session: agent peer closed",
			"session_id", s.ID,
			"peer_id", peerID,
		)
	}
}

func (s *Session) sendTerminationCallbacks(reason string) {
	if s.railsClient == nil {
		return
	}

	ctx := context.Background()
	durationSec := 0
	if !s.StartedAt.IsZero() {
		durationSec = int(time.Since(s.StartedAt).Seconds())
	}

	// Notify session terminated.
	if err := s.railsClient.NotifySessionTerminated(ctx, callback.SessionTerminatedPayload{
		SessionID:   s.ID,
		CallID:      s.CallID,
		Reason:      reason,
		DurationSec: durationSec,
	}); err != nil {
		slog.Error("session: failed to notify Rails of termination",
			"session_id", s.ID,
			"error", err,
		)
	}

	// Notify recording ready if we have one.
	if s.Recorder != nil && s.Recorder.FileSize() > 0 {
		if err := s.railsClient.NotifyRecordingReady(ctx, callback.RecordingReadyPayload{
			SessionID:     s.ID,
			CallID:        s.CallID,
			FilePath:      s.Recorder.CombinedFilePath(),
			DurationSec:   durationSec,
			FileSizeBytes: s.Recorder.FileSize(),
		}); err != nil {
			slog.Error("session: failed to notify Rails of recording",
				"session_id", s.ID,
				"error", err,
			)
		}
	}
}
