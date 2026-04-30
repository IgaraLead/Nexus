<script setup>
import { computed, ref, useAttrs } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useMapGetter, useStore } from 'dashboard/composables/store';
import {
  isVoiceCallEnabled,
  getVoiceCallProvider,
  VOICE_CALL_PROVIDERS,
} from 'dashboard/helper/inbox';
import { useAlert } from 'dashboard/composables';
import { frontendURL, conversationUrl } from 'dashboard/helper/URLHelper';
import { useCallsStore } from 'dashboard/stores/calls';
import { useWhatsappCallSession } from 'dashboard/composables/useWhatsappCallSession';
import ContactAPI from 'dashboard/api/contacts';

import Button from 'dashboard/components-next/button/Button.vue';
import Dialog from 'dashboard/components-next/dialog/Dialog.vue';

const props = defineProps({
  phone: { type: String, default: '' },
  contactId: { type: [String, Number], required: true },
  label: { type: String, default: '' },
  icon: { type: [String, Object, Function], default: '' },
  size: { type: String, default: 'sm' },
  tooltipLabel: { type: String, default: '' },
});

defineOptions({ inheritAttrs: false });
const attrs = useAttrs();
const route = useRoute();
const router = useRouter();
const store = useStore();

const { t } = useI18n();

const dialogRef = ref(null);

const inboxesList = useMapGetter('inboxes/getInboxes');
const contactsUiFlags = useMapGetter('contacts/getUIFlags');

const voiceInboxes = computed(() =>
  (inboxesList.value || []).filter(isVoiceCallEnabled)
);
const hasVoiceInboxes = computed(() => voiceInboxes.value.length > 0);

// Unified behavior: hide when no phone
const shouldRender = computed(() => hasVoiceInboxes.value && !!props.phone);

const isInitiatingCall = computed(() => {
  return contactsUiFlags.value?.isInitiatingCall || false;
});

const navigateToConversation = conversationId => {
  const accountId = route.params.accountId;
  if (conversationId && accountId) {
    const path = frontendURL(
      conversationUrl({
        accountId,
        id: conversationId,
      })
    );
    router.push({ path });
  }
};

const whatsappCallSession = useWhatsappCallSession();

// Find the most recent open conversation for this contact in the picked inbox.
// WhatsApp /initiate is conversation-scoped (unlike Twilio's contact-scoped path).
const findWhatsappConversationId = async inboxId => {
  const { data } = await ContactAPI.getConversations(props.contactId);
  const conversations = data?.payload || [];
  const match = conversations
    .filter(c => c.inbox_id === inboxId)
    .sort((a, b) => (b.last_activity_at || 0) - (a.last_activity_at || 0))[0];
  return match?.id || null;
};

const startWhatsappCall = async inboxId => {
  const conversationId = await findWhatsappConversationId(inboxId);
  if (!conversationId) {
    useAlert(t('CONTACT_PANEL.CALL_FAILED'));
    return;
  }

  const response =
    await whatsappCallSession.initiateOutboundCall(conversationId);
  if (!response?.id) {
    // Permission flow returns no id — banner already handled server-side; surface to user.
    useAlert(t('CONTACT_PANEL.CALL_INITIATED'));
    navigateToConversation(conversationId);
    return;
  }

  const callsStore = useCallsStore();
  callsStore.addCall({
    callSid: response.call_id,
    callId: response.id,
    conversationId,
    inboxId,
    callDirection: 'outbound',
    provider: 'whatsapp',
  });
  callsStore.setCallActive(response.call_id);

  useAlert(t('CONTACT_PANEL.CALL_INITIATED'));
  navigateToConversation(conversationId);
};

const startCall = async inboxId => {
  if (isInitiatingCall.value) return;

  const inbox = (inboxesList.value || []).find(i => i.id === inboxId);
  if (getVoiceCallProvider(inbox) === VOICE_CALL_PROVIDERS.WHATSAPP) {
    try {
      await startWhatsappCall(inboxId);
    } catch (error) {
      useAlert(error?.message || t('CONTACT_PANEL.CALL_FAILED'));
    }
    return;
  }

  try {
    const response = await store.dispatch('contacts/initiateCall', {
      contactId: props.contactId,
      inboxId,
    });
    const { call_sid: callSid, conversation_id: conversationId } = response;

    // Add call to store immediately so widget shows
    const callsStore = useCallsStore();
    callsStore.addCall({
      callSid,
      conversationId,
      inboxId,
      callDirection: 'outbound',
    });

    useAlert(t('CONTACT_PANEL.CALL_INITIATED'));
    navigateToConversation(response?.conversation_id);
  } catch (error) {
    const apiError = error?.message;
    useAlert(apiError || t('CONTACT_PANEL.CALL_FAILED'));
  }
};

const onClick = async () => {
  if (voiceInboxes.value.length > 1) {
    dialogRef.value?.open();
    return;
  }
  const [inbox] = voiceInboxes.value;
  await startCall(inbox.id);
};

const onPickInbox = async inbox => {
  dialogRef.value?.close();
  await startCall(inbox.id);
};
</script>

<template>
  <span class="contents">
    <Button
      v-if="shouldRender"
      v-tooltip.top-end="tooltipLabel || null"
      v-bind="attrs"
      :disabled="isInitiatingCall"
      :is-loading="isInitiatingCall"
      :label="label"
      :icon="icon"
      :size="size"
      @click="onClick"
    />

    <Dialog
      v-if="shouldRender && voiceInboxes.length > 1"
      ref="dialogRef"
      :title="$t('CONTACT_PANEL.VOICE_INBOX_PICKER.TITLE')"
      show-cancel-button
      :show-confirm-button="false"
      width="md"
    >
      <div class="flex flex-col gap-2">
        <button
          v-for="inbox in voiceInboxes"
          :key="inbox.id"
          type="button"
          class="flex items-center justify-between w-full px-4 py-2 text-left rounded-lg hover:bg-n-alpha-2"
          @click="onPickInbox(inbox)"
        >
          <div class="flex items-center gap-2">
            <span class="i-ri-phone-fill text-n-slate-10" />
            <span class="text-sm text-n-slate-12">{{ inbox.name }}</span>
          </div>
          <span v-if="inbox.phone_number" class="text-xs text-n-slate-10">
            {{ inbox.phone_number }}
          </span>
        </button>
      </div>
    </Dialog>
  </span>
</template>
