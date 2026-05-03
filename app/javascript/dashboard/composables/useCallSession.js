import { computed, ref, watch, onUnmounted, onMounted } from 'vue';
import { useStore } from 'vuex';
import VoiceAPI from 'dashboard/api/channel/voice/voiceAPIClient';
import TwilioVoiceClient from 'dashboard/api/channel/voice/twilioVoiceClient';
import { useCallsStore } from 'dashboard/stores/calls';
import {
  useWhatsappCallSession,
  sendWhatsappTerminateBeacon,
  cleanupWhatsappSession,
} from 'dashboard/composables/useWhatsappCallSession';
import { handleVoiceCallCreated } from 'dashboard/helper/voice';
import Timer from 'dashboard/helper/Timer';

const isWhatsappCall = call => call?.provider === 'whatsapp';

export function useCallSession() {
  const store = useStore();
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
  const hasIncomingCall = computed(() => callsStore.hasIncomingCall);

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
  // drops the agent leg for Twilio. Also warn while a call is ringing — the
  // cable broadcast that delivered the incoming-call event isn't replayed on
  // refresh, so the agent loses the ability to accept it.
  const handleBeforeUnload = event => {
    if (!hasActiveCall.value && !hasIncomingCall.value) return;
    event.preventDefault();
    event.returnValue = '';
  };

  // Hydrate the calls store from already-loaded conversation messages. The
  // voice_call.incoming / message.created cable events are one-shot and aren't
  // replayed when the page reconnects, so without this seeding a hard refresh
  // during a ringing call would leave the FloatingCallWidget empty even though
  // the call is still ringing on Meta's side.
  const seedCallsFromHydratedMessages = () => {
    const conversations = store.getters.getAllConversations || [];
    const currentUserId = store.getters.getCurrentUserID;
    conversations.forEach(conv => {
      (conv.messages || []).forEach(msg => {
        if (msg.content_type !== 'voice_call') return;
        if (msg.call?.status !== 'ringing') return;
        handleVoiceCallCreated(msg, currentUserId);
      });
    });
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
    seedCallsFromHydratedMessages();
  });

  // Conversations are typically fetched after this composable mounts, so the
  // initial seed pass runs before any messages exist. Re-seed whenever the
  // conversation list changes — addCall is idempotent (it merges by callSid).
  watch(
    () => store.getters.getAllConversations?.length,
    () => seedCallsFromHydratedMessages()
  );

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
    // eslint-disable-next-line no-console
    console.log('[CW Voice] joinCall', { conversationId, inboxId, callSid });
    if (isJoining.value) {
      // eslint-disable-next-line no-console
      console.warn('[CW Voice] joinCall: isJoining flag stuck');
      return null;
    }

    isJoining.value = true;
    try {
      const call = findCall(callSid);
      // eslint-disable-next-line no-console
      console.log('[CW Voice] joinCall: found call?', call);
      if (isWhatsappCall(call)) {
        // eslint-disable-next-line no-console
        console.log('[CW Voice] joinCall: WhatsApp branch', {
          callId: call.callId,
          hasSdpOffer: Boolean(call.sdpOffer),
          hasIceServers: Boolean(call.iceServers),
        });
        await whatsappSession.acceptIncomingCall({
          callId: call.callId,
          sdpOffer: call.sdpOffer,
          iceServers: call.iceServers,
        });
        // eslint-disable-next-line no-console
        console.log('[CW Voice] joinCall: WhatsApp accept POST returned OK');
        callsStore.setCallActive(callSid);
        durationTimer.start();
        return { callId: call.callId };
      }

      // eslint-disable-next-line no-console
      console.log(
        '[CW Voice] joinCall: Twilio branch (provider not whatsapp)',
        {
          provider: call?.provider,
        }
      );
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
