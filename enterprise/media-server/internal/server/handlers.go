package server

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/pion/webrtc/v4"

	"github.com/chatwoot/chatwoot-media-server/internal/config"
	"github.com/chatwoot/chatwoot-media-server/internal/media"
	"github.com/chatwoot/chatwoot-media-server/internal/peer"
	"github.com/chatwoot/chatwoot-media-server/internal/session"
)

// maxRequestBodySize limits JSON request bodies to 1MB to prevent memory exhaustion.
const maxRequestBodySize = 1 << 20

// startTime is set at server startup for uptime calculations.
var startTime = time.Now()

// Handlers implements all HTTP API endpoint handlers for the media server.
type Handlers struct {
	cfg     *config.Config
	manager *session.Manager
}

// NewHandlers creates a new Handlers instance backed by the given session
// manager and configuration.
func NewHandlers(cfg *config.Config, mgr *session.Manager) *Handlers {
	return &Handlers{cfg: cfg, manager: mgr}
}

// --- Request/Response types ---

// CreateSessionRequest is the JSON body for POST /sessions.
type CreateSessionRequest struct {
	CallID       string              `json:"call_id"`
	AccountID    string              `json:"account_id"`
	Direction    string              `json:"direction"`
	MetaSDPOffer string              `json:"meta_sdp_offer"`
	ICEServers   []ICEServerConfig   `json:"ice_servers"`
}

// ICEServerConfig mirrors webrtc.ICEServer for JSON deserialization.
type ICEServerConfig struct {
	URLs       []string `json:"urls"`
	Username   string   `json:"username,omitempty"`
	Credential string   `json:"credential,omitempty"`
}

// CreateSessionResponse is the JSON response for POST /sessions.
type CreateSessionResponse struct {
	SessionID    string `json:"session_id"`
	MetaSDPAnswer string `json:"meta_sdp_answer,omitempty"`
	MetaSDPOffer  string `json:"meta_sdp_offer,omitempty"`
	Status       string `json:"status"`
}

// AgentOfferRequest is the JSON body for POST /sessions/:id/agent-offer.
type AgentOfferRequest struct {
	PeerID     string            `json:"peer_id"`
	Role       string            `json:"role"`
	ICEServers []ICEServerConfig `json:"ice_servers"`
}

// AgentOfferResponse is the JSON response for POST /sessions/:id/agent-offer.
type AgentOfferResponse struct {
	SDPOffer   string            `json:"sdp_offer"`
	PeerID     string            `json:"peer_id"`
	ICEServers []ICEServerConfig `json:"ice_servers"`
}

// AgentAnswerRequest is the JSON body for POST /sessions/:id/agent-answer.
type AgentAnswerRequest struct {
	PeerID    string `json:"peer_id"`
	SDPAnswer string `json:"sdp_answer"`
}

// MetaAnswerRequest is the JSON body for POST /sessions/:id/meta-answer.
// Used for outgoing calls to deliver Meta's SDP answer to the media server
// so it can complete the Peer A (Meta-side) WebRTC handshake.
type MetaAnswerRequest struct {
	SDPAnswer string `json:"sdp_answer"`
}

// AgentAnswerResponse is the JSON response for POST /sessions/:id/agent-answer.
type AgentAnswerResponse struct {
	Status    string `json:"status"`
	Recording bool   `json:"recording"`
}

// AgentReconnectRequest is the JSON body for POST /sessions/:id/agent-reconnect.
type AgentReconnectRequest struct {
	OldPeerID  string            `json:"old_peer_id"`
	NewPeerID  string            `json:"new_peer_id"`
	Role       string            `json:"role"`
	ICEServers []ICEServerConfig `json:"ice_servers"`
}

// AgentReconnectResponse is the JSON response for POST /sessions/:id/agent-reconnect.
type AgentReconnectResponse struct {
	SDPOffer   string            `json:"sdp_offer"`
	PeerID     string            `json:"peer_id"`
	ICEServers []ICEServerConfig `json:"ice_servers"`
}

// TerminateResponse is the JSON response for POST /sessions/:id/terminate.
type TerminateResponse struct {
	Status            string `json:"status"`
	RecordingFile     string `json:"recording_file,omitempty"`
	RecordingSizeBytes int64 `json:"recording_size_bytes,omitempty"`
	DurationSeconds   int    `json:"duration_seconds"`
}

// AddPeerRequest is the JSON body for POST /sessions/:id/peers.
type AddPeerRequest struct {
	PeerID     string            `json:"peer_id"`
	Role       string            `json:"role"`
	ICEServers []ICEServerConfig `json:"ice_servers"`
}

// ChangePeerRoleRequest is the JSON body for PATCH /sessions/:id/peers/:peer_id/role.
type ChangePeerRoleRequest struct {
	Role string `json:"role"`
}

// InjectAudioRequest is the JSON body for POST /sessions/:id/inject-audio.
type InjectAudioRequest struct {
	ID     string `json:"id"`
	Source string `json:"source"`
	Mode   string `json:"mode"`
	Target string `json:"target"`
	Loop   bool   `json:"loop"`
}

// HealthResponse is the JSON response for GET /health.
type HealthResponse struct {
	Status         string `json:"status"`
	ActiveSessions int    `json:"active_sessions"`
	UptimeSeconds  int    `json:"uptime_seconds"`
}

// --- Handlers ---

// Health returns the server's health status. This endpoint does not require
// authentication and is used by container orchestrators for liveness checks.
func (h *Handlers) Health(w http.ResponseWriter, r *http.Request) {
	metrics := h.manager.GetMetrics()
	writeJSON(w, http.StatusOK, HealthResponse{
		Status:         "ok",
		ActiveSessions: metrics.ActiveSessions,
		UptimeSeconds:  int(time.Since(startTime).Seconds()),
	})
}

// Metrics returns Prometheus-compatible metrics about the media server.
func (h *Handlers) Metrics(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.manager.GetMetrics())
}

// CreateSession handles POST /sessions. It creates a new call session with a
// Meta-side peer connection and returns the SDP answer (for incoming calls)
// or SDP offer (for outgoing calls).
func (h *Handlers) CreateSession(w http.ResponseWriter, r *http.Request) {
	var req CreateSessionRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	if req.CallID == "" {
		writeError(w, http.StatusBadRequest, "call_id is required")
		return
	}
	if req.Direction != "incoming" && req.Direction != "outgoing" {
		writeError(w, http.StatusBadRequest, "direction must be 'incoming' or 'outgoing'")
		return
	}

	iceServers := toWebRTCICEServers(req.ICEServers, h.cfg)

	sess, sdpResult, err := h.manager.CreateSession(req.CallID, req.AccountID, req.Direction, req.MetaSDPOffer, iceServers)
	if err != nil {
		slog.Error("handler: failed to create session",
			"call_id", req.CallID,
			"error", err,
		)
		writeError(w, http.StatusInternalServerError, "failed to create session: "+err.Error())
		return
	}

	resp := CreateSessionResponse{
		SessionID: sess.ID,
		Status:    string(sess.Status),
	}
	if req.Direction == "incoming" {
		resp.MetaSDPAnswer = sdpResult
	} else {
		resp.MetaSDPOffer = sdpResult
	}

	slog.Info("handler: session created",
		"session_id", sess.ID,
		"call_id", req.CallID,
		"direction", req.Direction,
	)

	writeJSON(w, http.StatusCreated, resp)
}

// GetSession handles GET /sessions/{id}. It returns the current status of
// a call session.
func (h *Handlers) GetSession(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("id")
	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}
	writeJSON(w, http.StatusOK, sess.GetInfo())
}

// AgentOffer handles POST /sessions/{id}/agent-offer. It creates a new
// agent-side peer connection and returns the SDP offer to send to the
// agent's browser.
func (h *Handlers) AgentOffer(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("id")
	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}

	var req AgentOfferRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	if req.PeerID == "" {
		req.PeerID = fmt.Sprintf("agent_%d", time.Now().UnixNano())
	}

	role := peer.RoleActive
	if req.Role != "" {
		role = peer.PeerRole(req.Role)
	}

	iceServers := toWebRTCICEServers(req.ICEServers, h.cfg)

	sdpOffer, err := sess.CreateAgentPeer(req.PeerID, role, iceServers)
	if err != nil {
		slog.Error("handler: failed to create agent peer",
			"session_id", sessionID,
			"error", err,
		)
		writeError(w, http.StatusInternalServerError, "failed to create agent peer: "+err.Error())
		return
	}

	slog.Info("handler: agent offer created",
		"session_id", sessionID,
		"peer_id", req.PeerID,
	)

	writeJSON(w, http.StatusOK, AgentOfferResponse{
		SDPOffer:   sdpOffer,
		PeerID:     req.PeerID,
		ICEServers: req.ICEServers,
	})
}

// AgentAnswer handles POST /sessions/{id}/agent-answer. It sets the agent's
// SDP answer on the peer connection, completing the WebRTC handshake and
// enabling audio bridging.
func (h *Handlers) AgentAnswer(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("id")
	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}

	var req AgentAnswerRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	if req.SDPAnswer == "" {
		writeError(w, http.StatusBadRequest, "sdp_answer is required")
		return
	}
	// When peer_id is omitted (single-agent sessions), fall back to the only
	// agent peer attached to the session. Rails doesn't currently surface
	// peer_id through ActionCable, so browsers just send the SDP answer.
	if req.PeerID == "" {
		if only, ok := sess.SoleAgentPeerID(); ok {
			req.PeerID = only
		} else {
			writeError(w, http.StatusBadRequest, "peer_id is required (session has multiple agent peers)")
			return
		}
	}

	if err := sess.SetAgentAnswer(req.PeerID, req.SDPAnswer); err != nil {
		slog.Error("handler: failed to set agent answer",
			"session_id", sessionID,
			"peer_id", req.PeerID,
			"error", err,
		)
		writeError(w, http.StatusInternalServerError, "failed to set agent answer: "+err.Error())
		return
	}

	slog.Info("handler: agent answer set",
		"session_id", sessionID,
		"peer_id", req.PeerID,
	)

	writeJSON(w, http.StatusOK, AgentAnswerResponse{
		Status:    "bridged",
		Recording: true,
	})
}

// MetaAnswer handles POST /sessions/{id}/meta-answer. It sets Meta's SDP
// answer on the Meta-side peer connection for outbound calls.
func (h *Handlers) MetaAnswer(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("id")
	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}

	var req MetaAnswerRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}
	if req.SDPAnswer == "" {
		writeError(w, http.StatusBadRequest, "sdp_answer is required")
		return
	}

	if err := sess.SetMetaAnswer(req.SDPAnswer); err != nil {
		slog.Error("handler: failed to set meta answer",
			"session_id", sessionID,
			"error", err,
		)
		writeError(w, http.StatusInternalServerError, "failed to set meta answer: "+err.Error())
		return
	}

	slog.Info("handler: meta answer set", "session_id", sessionID)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// AgentReconnect handles POST /sessions/{id}/agent-reconnect. It tears down
// the old agent peer and creates a new one, returning a fresh SDP offer.
func (h *Handlers) AgentReconnect(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("id")
	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}

	var req AgentReconnectRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	if req.NewPeerID == "" {
		req.NewPeerID = fmt.Sprintf("agent_%d", time.Now().UnixNano())
	}

	role := peer.RoleActive
	if req.Role != "" {
		role = peer.PeerRole(req.Role)
	}

	iceServers := toWebRTCICEServers(req.ICEServers, h.cfg)

	sdpOffer, err := sess.ReconnectAgent(req.OldPeerID, req.NewPeerID, role, iceServers)
	if err != nil {
		slog.Error("handler: failed to reconnect agent",
			"session_id", sessionID,
			"error", err,
		)
		writeError(w, http.StatusInternalServerError, "failed to reconnect agent: "+err.Error())
		return
	}

	slog.Info("handler: agent reconnect complete",
		"session_id", sessionID,
		"old_peer_id", req.OldPeerID,
		"new_peer_id", req.NewPeerID,
	)

	writeJSON(w, http.StatusOK, AgentReconnectResponse{
		SDPOffer:   sdpOffer,
		PeerID:     req.NewPeerID,
		ICEServers: req.ICEServers,
	})
}

// TerminateSession handles POST /sessions/{id}/terminate. It ends the call,
// closes all peer connections, and finalizes the recording.
func (h *Handlers) TerminateSession(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("id")
	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}

	info := sess.GetInfo()
	sess.Terminate("api_request")

	resp := TerminateResponse{
		Status:          "terminated",
		DurationSeconds: info.DurationSeconds,
	}

	if sess.Recorder != nil {
		resp.RecordingFile = sess.RecordingFilePath()
		resp.RecordingSizeBytes = sess.Recorder.FileSize()
	}

	slog.Info("handler: session terminated",
		"session_id", sessionID,
		"duration", info.DurationSeconds,
	)

	writeJSON(w, http.StatusOK, resp)
}

// GetRecording handles GET /sessions/{id}/recording. It serves the combined
// recording file as a binary OGG download. An optional ?side=customer|agent
// query parameter returns the per-direction recording instead, which Rails
// uses to produce speaker-separated transcripts.
func (h *Handlers) GetRecording(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("id")
	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}

	var filePath, filename string
	switch r.URL.Query().Get("side") {
	case "customer":
		filePath = sess.RecorderCustomerPath()
		filename = sessionID + "_customer.ogg"
	case "agent":
		filePath = sess.RecorderAgentPath()
		filename = sessionID + "_agent.ogg"
	default:
		filePath = sess.RecordingFilePath()
		filename = sessionID + ".ogg"
	}

	if filePath == "" {
		writeError(w, http.StatusNotFound, "no recording available")
		return
	}

	f, err := os.Open(filePath)
	if err != nil {
		writeError(w, http.StatusNotFound, "recording file not found")
		return
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to stat recording file")
		return
	}

	w.Header().Set("Content-Type", "audio/ogg")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	http.ServeContent(w, r, filePath, stat.ModTime(), f)
}

// DeleteSession handles DELETE /sessions/{id}. It terminates the session and
// removes all associated recording files.
func (h *Handlers) DeleteSession(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("id")
	if err := h.manager.DeleteSession(sessionID); err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	slog.Info("handler: session deleted", "session_id", sessionID)
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// AddPeer handles POST /sessions/{id}/peers. It adds a new participant peer
// to an existing session (multi-participant support).
func (h *Handlers) AddPeer(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("id")
	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}

	var req AddPeerRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	if req.PeerID == "" {
		req.PeerID = fmt.Sprintf("peer_%d", time.Now().UnixNano())
	}

	role := peer.RoleActive
	if req.Role != "" {
		role = peer.PeerRole(req.Role)
	}

	iceServers := toWebRTCICEServers(req.ICEServers, h.cfg)

	sdpOffer, err := sess.CreateAgentPeer(req.PeerID, role, iceServers)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to add peer: "+err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, AgentOfferResponse{
		SDPOffer:   sdpOffer,
		PeerID:     req.PeerID,
		ICEServers: req.ICEServers,
	})
}

// RemovePeer handles DELETE /sessions/{id}/peers/{peer_id}. It removes a
// specific participant from the session.
func (h *Handlers) RemovePeer(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("id")
	peerID := r.PathValue("peer_id")

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}

	if err := sess.RemoveAgentPeer(peerID); err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "removed"})
}

// ChangePeerRole handles PATCH /sessions/{id}/peers/{peer_id}/role. It
// changes the role of a connected participant.
func (h *Handlers) ChangePeerRole(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("id")
	peerID := r.PathValue("peer_id")

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}

	var req ChangePeerRoleRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	if err := sess.ChangeAgentRole(peerID, peer.PeerRole(req.Role)); err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "updated", "role": req.Role})
}

// InjectAudio handles POST /sessions/{id}/inject-audio. It starts playing
// an audio file into the call's RTP stream.
func (h *Handlers) InjectAudio(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("id")
	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}

	var req InjectAudioRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	if req.ID == "" {
		req.ID = fmt.Sprintf("inj_%d", time.Now().UnixNano())
	}
	if req.Mode == "" {
		req.Mode = "replace"
	}
	if req.Target == "" {
		req.Target = "meta"
	}

	injector := media.NewInjector(req.ID, req.Source, req.Mode, req.Target, req.Loop)

	// Determine the target track based on the target parameter.
	target := sess.GetInjectorTarget(req.Target)
	if target == nil {
		writeError(w, http.StatusBadRequest, "target track not available")
		return
	}

	if err := injector.Start(target); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start injection: "+err.Error())
		return
	}

	sess.AddInjector(req.ID, injector)

	writeJSON(w, http.StatusCreated, map[string]string{
		"id":     req.ID,
		"status": "started",
	})
}

// StopInjectAudio handles DELETE /sessions/{id}/inject-audio/{inj_id}. It
// stops an active audio injection.
func (h *Handlers) StopInjectAudio(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("id")
	injID := r.PathValue("inj_id")

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}

	if err := sess.StopInjector(injID); err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "stopped"})
}

// --- Helpers ---

func readJSON(r *http.Request, v any) error {
	defer r.Body.Close()
	limited := io.LimitReader(r.Body, maxRequestBodySize)
	err := json.NewDecoder(limited).Decode(v)
	// Tolerate empty bodies — handlers with all-optional fields treat this
	// as "use defaults" rather than failing.
	if err == io.EOF {
		return nil
	}
	return err
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// toWebRTCICEServers converts the request ICE server configs to Pion's
// ICEServer type, merging with any STUN/TURN servers from the global config.
func toWebRTCICEServers(reqServers []ICEServerConfig, cfg *config.Config) []webrtc.ICEServer {
	servers := make([]webrtc.ICEServer, 0, len(reqServers)+2)

	// Add request-provided servers.
	for _, s := range reqServers {
		server := webrtc.ICEServer{URLs: s.URLs}
		if s.Username != "" {
			server.Username = s.Username
			server.Credential = s.Credential
			server.CredentialType = webrtc.ICECredentialTypePassword
		}
		servers = append(servers, server)
	}

	// Add global STUN servers if no STUN was provided in the request.
	hasSTUN := false
	for _, s := range reqServers {
		for _, u := range s.URLs {
			if strings.HasPrefix(u, "stun:") {
				hasSTUN = true
				break
			}
		}
	}
	if !hasSTUN && len(cfg.STUNServers) > 0 {
		servers = append(servers, webrtc.ICEServer{URLs: cfg.STUNServers})
	}

	// Add global TURN servers.
	if len(cfg.TURNServers) > 0 && cfg.TURNUsername != "" {
		servers = append(servers, webrtc.ICEServer{
			URLs:           cfg.TURNServers,
			Username:       cfg.TURNUsername,
			Credential:     cfg.TURNPassword,
			CredentialType: webrtc.ICECredentialTypePassword,
		})
	}

	return servers
}
