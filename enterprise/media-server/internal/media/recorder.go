// Package media provides audio bridging, recording, and injection capabilities
// for the media server's call sessions.
package media

import (
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"github.com/pion/rtp"
	"github.com/pion/webrtc/v4/pkg/media/oggwriter"
)

// Recorder writes incoming Opus RTP packets to two per-direction OGG files
// (customer and agent). At finalize time the two files are mixed into a single
// stereo combined.ogg via ffmpeg so playback and Whisper transcription receive
// a file with coherent OGG pages and correct duration.
//
// Writing both streams to a single oggwriter produces a file with non-monotonic
// granule positions — the two RTP streams have unrelated clocks and sequence
// numbers — which breaks both the reported audio duration in browsers and the
// transcription output.
type Recorder struct {
	sessionID string
	dir       string

	// combinedFile is produced by ffmpeg at finalize; never written to directly.
	combinedFile string

	// customerWriter writes only customer audio (Meta-side track).
	customerWriter *oggwriter.OggWriter
	customerFile   string

	// agentWriter writes only agent audio (browser-side track).
	agentWriter *oggwriter.OggWriter
	agentFile   string

	startedAt time.Time
	finalized bool
	mu        sync.Mutex
}

// NewRecorder creates a new recorder that writes OGG/Opus files to the given
// directory. Three files are tracked:
//   - {sessionID}_customer.ogg (customer channel only, written live)
//   - {sessionID}_agent.ogg    (agent channel only, written live)
//   - {sessionID}.ogg          (combined stereo, produced at Finalize via ffmpeg)
func NewRecorder(sessionID, dir string) (*Recorder, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("create recordings directory: %w", err)
	}

	combinedFile := filepath.Join(dir, sessionID+".ogg")
	customerFile := filepath.Join(dir, sessionID+"_customer.ogg")
	agentFile := filepath.Join(dir, sessionID+"_agent.ogg")

	customerWriter, err := oggwriter.New(customerFile, 48000, 1)
	if err != nil {
		return nil, fmt.Errorf("create customer OGG writer: %w", err)
	}

	agentWriter, err := oggwriter.New(agentFile, 48000, 1)
	if err != nil {
		customerWriter.Close()
		return nil, fmt.Errorf("create agent OGG writer: %w", err)
	}

	slog.Info("recorder: started",
		"session_id", sessionID,
		"customer_file", customerFile,
		"agent_file", agentFile,
	)

	return &Recorder{
		sessionID:      sessionID,
		dir:            dir,
		combinedFile:   combinedFile,
		customerWriter: customerWriter,
		customerFile:   customerFile,
		agentWriter:    agentWriter,
		agentFile:      agentFile,
		startedAt:      time.Now(),
	}, nil
}

// WriteCustomerRTP writes an RTP packet from the customer's audio stream
// (Meta-side, Peer A) to the customer-only OGG file.
func (r *Recorder) WriteCustomerRTP(pkt *rtp.Packet) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.finalized {
		return nil
	}

	if err := r.customerWriter.WriteRTP(pkt); err != nil {
		return fmt.Errorf("write customer RTP: %w", err)
	}
	return nil
}

// WriteAgentRTP writes an RTP packet from the agent's audio stream
// (browser-side, Peer B) to the agent-only OGG file.
func (r *Recorder) WriteAgentRTP(pkt *rtp.Packet) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.finalized {
		return nil
	}

	if err := r.agentWriter.WriteRTP(pkt); err != nil {
		return fmt.Errorf("write agent RTP: %w", err)
	}
	return nil
}

// Finalize closes the per-direction writers, then merges them into a single
// stereo combined.ogg via ffmpeg. If ffmpeg isn't on PATH the combined file
// is produced by copying the customer-side file as a fallback so that at
// least one side is playable. Transcription quality degrades in the fallback
// but the pipeline does not break.
func (r *Recorder) Finalize() error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.finalized {
		return nil
	}
	r.finalized = true

	var errs []error
	if err := r.customerWriter.Close(); err != nil {
		errs = append(errs, fmt.Errorf("close customer writer: %w", err))
	}
	if err := r.agentWriter.Close(); err != nil {
		errs = append(errs, fmt.Errorf("close agent writer: %w", err))
	}

	if err := r.buildCombinedFile(); err != nil {
		errs = append(errs, err)
	}

	if len(errs) > 0 {
		return fmt.Errorf("finalize recorder: %v", errs)
	}

	slog.Info("recorder: finalized",
		"session_id", r.sessionID,
		"duration", time.Since(r.startedAt).Round(time.Second),
		"combined_file", r.combinedFile,
	)
	return nil
}

// buildCombinedFile mixes the two per-direction OGG files into a single
// stereo combined.ogg so playback and transcription receive a coherent file
// with correct duration metadata.
func (r *Recorder) buildCombinedFile() error {
	customerExists := fileNonEmpty(r.customerFile)
	agentExists := fileNonEmpty(r.agentFile)
	if !customerExists && !agentExists {
		return errors.New("build combined file: no per-direction recordings to merge")
	}

	ffmpegPath, err := exec.LookPath("ffmpeg")
	if err != nil {
		slog.Warn("recorder: ffmpeg not found, falling back to single-side combined file",
			"session_id", r.sessionID,
		)
		src := r.customerFile
		if !customerExists {
			src = r.agentFile
		}
		return copyFile(src, r.combinedFile)
	}

	args := []string{"-y", "-loglevel", "error"}
	if customerExists {
		args = append(args, "-i", r.customerFile)
	}
	if agentExists {
		args = append(args, "-i", r.agentFile)
	}

	switch {
	case customerExists && agentExists:
		// Mix two mono streams into one mono track. amix pads the shorter input
		// with silence so the output duration matches the longer input, and
		// uses the longer input as the reference for timing so the OGG pages
		// carry correct granule positions.
		args = append(args,
			"-filter_complex", "[0:a][1:a]amix=inputs=2:duration=longest:dropout_transition=0[aout]",
			"-map", "[aout]",
		)
	default:
		// Only one side — just remux to produce correct OGG duration headers.
		args = append(args, "-map", "0:a")
	}

	args = append(args, "-c:a", "libopus", "-b:a", "48000", "-ar", "48000", "-ac", "1", r.combinedFile)

	cmd := exec.Command(ffmpegPath, args...)
	out, cmdErr := cmd.CombinedOutput()
	if cmdErr != nil {
		return fmt.Errorf("ffmpeg mix failed: %w (%s)", cmdErr, string(out))
	}
	return nil
}

func fileNonEmpty(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.Size() > 0
}

func copyFile(src, dst string) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return fmt.Errorf("read %s: %w", src, err)
	}
	if err := os.WriteFile(dst, data, 0o644); err != nil {
		return fmt.Errorf("write %s: %w", dst, err)
	}
	return nil
}

// CombinedFilePath returns the filesystem path of the combined recording file.
func (r *Recorder) CombinedFilePath() string {
	return r.combinedFile
}

// CustomerFilePath returns the filesystem path of the customer-only recording.
func (r *Recorder) CustomerFilePath() string {
	return r.customerFile
}

// AgentFilePath returns the filesystem path of the agent-only recording.
func (r *Recorder) AgentFilePath() string {
	return r.agentFile
}

// Duration returns the elapsed recording time since the recorder was started.
func (r *Recorder) Duration() time.Duration {
	return time.Since(r.startedAt)
}

// FileSize returns the size of the combined recording file in bytes, or -1 on
// error.
func (r *Recorder) FileSize() int64 {
	info, err := os.Stat(r.combinedFile)
	if err != nil {
		return -1
	}
	return info.Size()
}

// Cleanup removes all recording files for this session from disk.
func (r *Recorder) Cleanup() {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, f := range []string{r.combinedFile, r.customerFile, r.agentFile} {
		if err := os.Remove(f); err != nil && !os.IsNotExist(err) {
			slog.Warn("recorder: failed to remove file",
				"file", f,
				"error", err,
			)
		}
	}
}
