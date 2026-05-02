import { ref } from 'vue';
import WhatsappCallsAPI from 'dashboard/api/channel/whatsapp/whatsappCallsAPI';

// Browser ↔ Meta WebRTC is a singleton — only one PeerConnection at a time can
// hold the user's mic. Module-level state lets cable handlers and the pagehide
// listener reach the live session without prop-drilling refs through composables.
let pc = null;
let localStream = null;
let remoteStream = null;
let remoteAudioEl = null;
let mediaRecorder = null;
let recorderChunks = [];
let audioContext = null;
let activeCallId = null;
let intentionallyClosing = false;

// Lazily attach a hidden <audio autoplay> to the document so Meta's track
// actually plays through the speakers — without this, mic flows to Meta but
// the user hears nothing back.
const ensureRemoteAudioElement = () => {
  if (remoteAudioEl) return remoteAudioEl;
  remoteAudioEl = document.createElement('audio');
  remoteAudioEl.id = 'whatsapp-call-remote-audio';
  remoteAudioEl.autoplay = true;
  remoteAudioEl.playsInline = true;
  remoteAudioEl.style.display = 'none';
  document.body.appendChild(remoteAudioEl);
  return remoteAudioEl;
};

const playRemoteStream = stream => {
  const el = ensureRemoteAudioElement();
  el.srcObject = stream;
  // play() may reject under autoplay policies; surface to console but don't crash the call.
  el.play().catch(err => {
    // eslint-disable-next-line no-console
    console.warn('[WhatsApp Call] remote audio play() failed:', err);
  });
};

// Smaller timeslice → chunks flush to memory every second so a remote hangup
// that races cleanup still leaves data behind to upload.
const RECORDING_TIMESLICE_MS = 1000;
const ICE_GATHER_TIMEOUT_MS = 10000;
const RECORDER_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
];

// Outbound calls don't get ice_servers from the backend (call doesn't exist yet
// at offer time). Without STUN the browser only has host candidates which can't
// reach Meta through NAT, so the browser→Meta direction silently drops media.
const DEFAULT_OUTBOUND_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

const waitForIceGatheringComplete = peer =>
  new Promise(resolve => {
    if (peer.iceGatheringState === 'complete') {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ICE_GATHER_TIMEOUT_MS);
    peer.addEventListener('icegatheringstatechange', () => {
      if (peer.iceGatheringState === 'complete') {
        clearTimeout(timer);
        resolve();
      }
    });
  });

const cleanup = () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try {
      mediaRecorder.stop();
    } catch (_) {
      /* noop */
    }
  }
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close().catch(() => {});
  }
  if (localStream) localStream.getTracks().forEach(t => t.stop());
  if (remoteStream) remoteStream.getTracks().forEach(t => t.stop());
  if (pc) pc.close();
  if (remoteAudioEl) remoteAudioEl.srcObject = null;

  pc = null;
  localStream = null;
  remoteStream = null;
  mediaRecorder = null;
  recorderChunks = [];
  audioContext = null;
  activeCallId = null;
  intentionallyClosing = false;
};

// Mix local mic + remote audio via Web Audio so the recording captures both legs.
const setupRecorder = () => {
  if (!localStream || !remoteStream || mediaRecorder) return;
  // Without at least one remote track, createMediaStreamSource on remoteStream
  // wires up to nothing — the recorded mix is effectively just silence.
  if (remoteStream.getAudioTracks().length === 0) return;

  audioContext = new AudioContext({ sampleRate: 48000 });
  // AudioContext starts suspended under most autoplay policies. Resume so the
  // graph actually runs; otherwise the destination stream produces silence.
  audioContext.resume().catch(() => {});

  const destination = audioContext.createMediaStreamDestination();
  audioContext.createMediaStreamSource(localStream).connect(destination);
  audioContext.createMediaStreamSource(remoteStream).connect(destination);

  const mimeType = RECORDER_MIME_CANDIDATES.find(t =>
    MediaRecorder.isTypeSupported(t)
  );
  if (!mimeType) return;

  recorderChunks = [];
  mediaRecorder = new MediaRecorder(destination.stream, { mimeType });
  mediaRecorder.ondataavailable = event => {
    if (event.data && event.data.size > 0) recorderChunks.push(event.data);
  };
  mediaRecorder.start(RECORDING_TIMESLICE_MS);
};

const buildPeerConnection = iceServers => {
  const config = iceServers && iceServers.length ? { iceServers } : {};
  pc = new RTCPeerConnection(config);
  remoteStream = new MediaStream();
  pc.ontrack = event => {
    // Add to the stable placeholder stream so any sources/recorders referencing
    // it stay connected — never reassign the variable, since the recorder's
    // audioContext source taps the original MediaStream object.
    const tracks =
      event.streams && event.streams[0]
        ? event.streams[0].getTracks()
        : [event.track];
    tracks.forEach(track => {
      if (!remoteStream.getTracks().includes(track))
        remoteStream.addTrack(track);
    });
    playRemoteStream(remoteStream);
    // Defer recorder setup until we actually have remote tracks; createMediaStreamSource
    // on an empty MediaStream is unreliable across browsers.
    setupRecorder();
  };
  return pc;
};

const stopRecorderAndUpload = async callId => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    await new Promise(resolve => {
      mediaRecorder.addEventListener('stop', resolve, { once: true });
      try {
        mediaRecorder.stop();
      } catch (_) {
        resolve();
      }
    });
  }
  if (!recorderChunks.length || !callId) return;

  const blob = new Blob(recorderChunks, { type: recorderChunks[0].type });
  try {
    await WhatsappCallsAPI.uploadRecording(callId, blob);
  } catch (_) {
    /* best-effort — server-side idempotency guard handles a retry */
  }
};

export function useWhatsappCallSession() {
  const isInitiating = ref(false);
  const error = ref(null);

  const prepareInboundAnswer = async (sdpOffer, iceServers) => {
    cleanup();
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    buildPeerConnection(iceServers);
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    await pc.setRemoteDescription({ type: 'offer', sdp: sdpOffer });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIceGatheringComplete(pc);
    // Recorder fires from ontrack once remote tracks arrive.
    return pc.localDescription.sdp;
  };

  const prepareOutboundOffer = async () => {
    cleanup();
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    buildPeerConnection(DEFAULT_OUTBOUND_ICE_SERVERS);
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGatheringComplete(pc);
    return pc.localDescription.sdp;
  };

  const acceptIncomingCall = async ({ callId, sdpOffer, iceServers }) => {
    // The store may not have sdpOffer yet (cable's voice_call.incoming raced
    // the click), so fall back to GET /whatsapp_calls/:id which exposes the
    // SDP offer + ICE servers from the show jbuilder.
    let offer = sdpOffer;
    let ice = iceServers;
    if (!offer && callId) {
      try {
        const fresh = await WhatsappCallsAPI.show(callId);
        offer = fresh?.sdp_offer || fresh?.sdpOffer;
        ice = ice || fresh?.ice_servers || fresh?.iceServers;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(
          '[WhatsApp Call] failed to fetch call data for accept:',
          e
        );
      }
    }
    if (!offer) {
      throw new Error('Missing sdp_offer for accept — call may have ended.');
    }

    const sdpAnswer = await prepareInboundAnswer(offer, ice);
    activeCallId = callId;
    await WhatsappCallsAPI.accept(callId, sdpAnswer);
  };

  const rejectIncomingCall = async callId => {
    intentionallyClosing = true;
    try {
      await WhatsappCallsAPI.reject(callId);
    } finally {
      cleanup();
    }
  };

  const initiateOutboundCall = async conversationId => {
    if (isInitiating.value) return null;
    isInitiating.value = true;
    error.value = null;
    try {
      const sdpOffer = await prepareOutboundOffer();
      const response = await WhatsappCallsAPI.initiate(
        conversationId,
        sdpOffer
      );
      // Permission flow returns no call id — let the caller render the banner.
      activeCallId = response?.id || null;
      return response;
    } catch (e) {
      cleanup();
      error.value = e;
      throw e;
    } finally {
      isInitiating.value = false;
    }
  };

  const endActiveCall = async () => {
    if (!activeCallId) {
      cleanup();
      return;
    }
    intentionallyClosing = true;
    const callIdSnapshot = activeCallId;
    try {
      await stopRecorderAndUpload(callIdSnapshot);
      await WhatsappCallsAPI.terminate(callIdSnapshot).catch(() => {});
    } finally {
      cleanup();
    }
  };

  return {
    isInitiating,
    error,
    prepareInboundAnswer,
    prepareOutboundOffer,
    acceptIncomingCall,
    rejectIncomingCall,
    initiateOutboundCall,
    endActiveCall,
  };
}

// Cable handlers fire outside any composable instance; expose the shared session
// surface so they can apply the outbound answer onto the live PeerConnection.
export const applyOutboundAnswer = async (callId, sdpAnswer) => {
  if (!pc) return;
  activeCallId = callId;
  await pc.setRemoteDescription({ type: 'answer', sdp: sdpAnswer });
  // Recorder + audio playback fire from ontrack as soon as Meta's tracks arrive.
};

export const hasActiveWhatsappCall = () => Boolean(activeCallId);

// Used by the calls store as a sync teardown safety net.
export const cleanupWhatsappSession = () => cleanup();

// Cable-driven end (contact hung up / call timed out). Flush any in-memory
// recorder chunks and upload them so the resulting message bubble shows the
// audio + transcript — without this, only agent-initiated hangups upload.
export const handleWhatsappRemoteEnd = async callId => {
  // Snapshot before cleanup nulls activeCallId.
  const id = callId || activeCallId;
  if (!id) {
    cleanup();
    return;
  }
  try {
    await stopRecorderAndUpload(id);
  } finally {
    cleanup();
  }
};

// Mute helpers — toggle the mic track's enabled flag (instantaneous, no renegotiation).
export const setWhatsappCallMuted = muted => {
  if (!localStream) return false;
  localStream.getAudioTracks().forEach(track => {
    track.enabled = !muted;
  });
  return muted;
};

export const isWhatsappCallMuted = () => {
  if (!localStream) return false;
  const tracks = localStream.getAudioTracks();
  if (!tracks.length) return false;
  return !tracks[0].enabled;
};

// Best-effort terminate when the tab actually closes after the beforeunload prompt.
export const sendWhatsappTerminateBeacon = () => {
  if (!activeCallId || intentionallyClosing) return;
  const accountId = window.location.pathname.split('/')[3];
  if (!accountId) return;
  const url = `/api/v1/accounts/${accountId}/whatsapp_calls/${activeCallId}/terminate`;
  try {
    navigator.sendBeacon(url);
  } catch (_) {
    /* noop */
  }
};
