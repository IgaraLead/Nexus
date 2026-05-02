import { computed, ref, watch, onUnmounted, onMounted } from 'vue';
import VoiceAPI from 'dashboard/api/channel/voice/voiceAPIClient';
import TwilioVoiceClient from 'dashboard/api/channel/voice/twilioVoiceClient';
import { useCallsStore } from 'dashboard/stores/calls';
import {
  useWhatsappCallSession,
  sendWhatsappTerminateBeacon,
  cleanupWhatsappSession,
} from 'dashboard/composables/useWhatsappCallSession';
import Timer from 'dashboard/helper/Timer';

const isWhatsappCall = call => call?.provider === 'whatsapp';

export function useCallSession() {
  const callsStore = useCallsStore();
  const whatsappSession = useWhatsappCallSession();
  const isJoining = ref(false);
  const callDuration = ref(0);
  const durationTimer = new Timer(elapsed => {
    callDuration.value = elapsed;
  });

  const activeCall = computed(() => callsStore.activeCall);
  const incomingCalls = computed(() => callsStore.incomingCalls);
  const hasActiveCall = computed(() => callsStore.hasActiveCall);

  watch(
    hasActiveCall,
    active => {
      if (active) {
        durationTimer.start();
      } else {
        durationTimer.stop();
        callDuration.value = 0;
      }
    },
    { immediate: true }
  );

  // Browser-native confirm prompt when reload/close happens mid-call. Reload
  // tears down the WebRTC session permanently for WhatsApp (no rejoin) and
  // drops the agent leg for Twilio, so warn either way.
  const handleBeforeUnload = event => {
    if (!hasActiveCall.value) return;
    event.preventDefault();
    event.returnValue = '';
  };

  // pagehide fires after the user confirms the prompt. Let the WhatsApp session
  // best-effort sendBeacon a terminate so the server doesn't keep the call open.
  const handlePageHide = () => {
    sendWhatsappTerminateBeacon();
  };

  const handleTwilioDisconnected = () => callsStore.clearActiveCall();

  onMounted(() => {
    TwilioVoiceClient.addEventListener(
      'call:disconnected',
      handleTwilioDisconnected
    );
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
  });

  onUnmounted(() => {
    durationTimer.stop();
    TwilioVoiceClient.removeEventListener(
      'call:disconnected',
      handleTwilioDisconnected
    );
    window.removeEventListener('beforeunload', handleBeforeUnload);
    window.removeEventListener('pagehide', handlePageHide);
  });

  const findCall = callSid => callsStore.calls.find(c => c.callSid === callSid);

  const endCall = async ({ conversationId, inboxId, callSid }) => {
    if (isWhatsappCall(findCall(callSid))) {
      await whatsappSession.endActiveCall();
      durationTimer.stop();
      callsStore.clearActiveCall();
      return;
    }

    await VoiceAPI.leaveConference({ inboxId, conversationId, callSid });
    TwilioVoiceClient.endClientCall();
    durationTimer.stop();
    callsStore.clearActiveCall();
  };

  const joinCall = async ({ conversationId, inboxId, callSid }) => {
    if (isJoining.value) return null;

    isJoining.value = true;
    try {
      const call = findCall(callSid);
      if (isWhatsappCall(call)) {
        await whatsappSession.acceptIncomingCall({
          callId: call.callId,
          sdpOffer: call.sdpOffer,
          iceServers: call.iceServers,
        });
        callsStore.setCallActive(callSid);
        durationTimer.start();
        return { callId: call.callId };
      }

      const device = await TwilioVoiceClient.initializeDevice(inboxId);
      if (!device) return null;

      const joinResponse = await VoiceAPI.joinConference({
        conversationId,
        inboxId,
        callSid,
      });

      await TwilioVoiceClient.joinClientCall({
        to: joinResponse?.conference_sid,
        conversationId,
        callSid,
      });

      callsStore.setCallActive(callSid);
      durationTimer.start();

      return { conferenceSid: joinResponse?.conference_sid };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to join call:', error);
      // Tear down any half-built WebRTC state so the user's next click starts
      // fresh; otherwise the leftover pc + mic stream survives and confuses
      // the second-attempt SDP exchange.
      cleanupWhatsappSession();
      return null;
    } finally {
      isJoining.value = false;
    }
  };

  const rejectIncomingCall = callSid => {
    const call = findCall(callSid);
    if (isWhatsappCall(call) && call?.callId) {
      whatsappSession.rejectIncomingCall(call.callId);
    } else {
      TwilioVoiceClient.endClientCall();
    }
    callsStore.dismissCall(callSid);
  };

  const dismissCall = callSid => {
    callsStore.dismissCall(callSid);
  };

  const formattedCallDuration = computed(() => {
    const minutes = Math.floor(callDuration.value / 60);
    const seconds = callDuration.value % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  });

  return {
    activeCall,
    incomingCalls,
    hasActiveCall,
    isJoining,
    formattedCallDuration,
    joinCall,
    endCall,
    rejectIncomingCall,
    dismissCall,
  };
}
