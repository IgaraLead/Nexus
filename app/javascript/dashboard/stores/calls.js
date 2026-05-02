import { defineStore } from 'pinia';
import TwilioVoiceClient from 'dashboard/api/channel/voice/twilioVoiceClient';
import { cleanupWhatsappSession } from 'dashboard/composables/useWhatsappCallSession';
import { TERMINAL_STATUSES } from 'dashboard/helper/voice';

const teardownByProvider = call => {
  if (call?.provider === 'whatsapp') {
    cleanupWhatsappSession();
  } else {
    TwilioVoiceClient.endClientCall();
  }
};

export const useCallsStore = defineStore('calls', {
  state: () => ({
    calls: [],
  }),

  getters: {
    activeCall: state => state.calls.find(call => call.isActive) || null,
    hasActiveCall: state => state.calls.some(call => call.isActive),
    incomingCalls: state => state.calls.filter(call => !call.isActive),
    hasIncomingCall: state => state.calls.some(call => !call.isActive),
  },

  actions: {
    handleCallStatusChanged({ callSid, status }) {
      if (!TERMINAL_STATUSES.includes(status)) return;

      const call = this.calls.find(c => c.callSid === callSid);
      // For WhatsApp, the upload-and-cleanup must happen before the recorder
      // state is wiped — that runs from the voice_call.ended cable handler.
      // If we tear down here (race-winning the cable end-event), the recorder
      // chunks are gone before they get uploaded, so the recording is lost.
      // Just drop the call from the store; voice_call.ended will idempotently
      // finish cleanup once it arrives.
      if (call?.provider === 'whatsapp') {
        this.calls = this.calls.filter(c => c.callSid !== callSid);
        return;
      }

      this.removeCall(callSid);
    },

    addCall(callData) {
      if (!callData?.callSid) return;
      const existing = this.calls.find(c => c.callSid === callData.callSid);
      if (existing) {
        // Merge so a later cable event with sdp_offer/provider/caller fills in
        // gaps left by the earlier message.created path (and vice versa).
        Object.assign(existing, callData, { isActive: existing.isActive });
        return;
      }

      this.calls.push({
        ...callData,
        isActive: false,
      });
    },

    removeCall(callSid) {
      const callToRemove = this.calls.find(c => c.callSid === callSid);
      if (callToRemove?.isActive) {
        teardownByProvider(callToRemove);
      }
      this.calls = this.calls.filter(c => c.callSid !== callSid);
    },

    setCallActive(callSid) {
      this.calls = this.calls.map(call => ({
        ...call,
        isActive: call.callSid === callSid,
      }));
    },

    clearActiveCall() {
      const active = this.calls.find(c => c.isActive);
      teardownByProvider(active);
      this.calls = this.calls.filter(call => !call.isActive);
    },

    dismissCall(callSid) {
      this.calls = this.calls.filter(call => call.callSid !== callSid);
    },
  },
});
