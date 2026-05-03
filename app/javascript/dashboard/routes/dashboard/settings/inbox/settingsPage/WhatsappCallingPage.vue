<script>
import { useAlert } from 'dashboard/composables';
import SettingsFieldSection from 'dashboard/components-next/Settings/SettingsFieldSection.vue';
import SettingsToggleSection from 'dashboard/components-next/Settings/SettingsToggleSection.vue';
import NextButton from 'dashboard/components-next/button/Button.vue';

export default {
  components: {
    SettingsFieldSection,
    SettingsToggleSection,
    NextButton,
  },
  props: {
    inbox: {
      type: Object,
      default: () => ({}),
    },
  },
  data() {
    return {
      callingEnabled: this.inbox.provider_config?.calling_enabled || false,
      isUpdating: false,
    };
  },
  computed: {
    phoneNumber() {
      return (
        this.inbox.provider_config?.phone_number || this.inbox.phone_number
      );
    },
  },
  watch: {
    'inbox.provider_config.calling_enabled'(val) {
      this.callingEnabled = val || false;
    },
  },
  methods: {
    async updateCallingSettings() {
      this.isUpdating = true;
      try {
        await this.$store.dispatch('inboxes/updateInbox', {
          id: this.inbox.id,
          formData: false,
          channel: {
            provider_config: {
              ...this.inbox.provider_config,
              calling_enabled: this.callingEnabled,
            },
          },
        });
        useAlert(this.$t('INBOX_MGMT.EDIT.API.SUCCESS_MESSAGE'));
      } catch (error) {
        useAlert(this.$t('INBOX_MGMT.EDIT.API.ERROR_MESSAGE'));
      } finally {
        this.isUpdating = false;
      }
    },
  },
};
</script>

<template>
  <div class="flex flex-col gap-6">
    <SettingsToggleSection
      v-model="callingEnabled"
      :header="$t('INBOX_MGMT.WHATSAPP_CALLING.ENABLE.LABEL')"
      :description="$t('INBOX_MGMT.WHATSAPP_CALLING.ENABLE.DESCRIPTION')"
    />

    <SettingsFieldSection
      v-if="phoneNumber"
      :label="$t('INBOX_MGMT.WHATSAPP_CALLING.PHONE_NUMBER.LABEL')"
      :help-text="$t('INBOX_MGMT.WHATSAPP_CALLING.PHONE_NUMBER.HELP_TEXT')"
    >
      <woot-code :script="phoneNumber" lang="html" />
    </SettingsFieldSection>

    <SettingsFieldSection
      :label="$t('INBOX_MGMT.WHATSAPP_CALLING.HOW_IT_WORKS.LABEL')"
      :help-text="$t('INBOX_MGMT.WHATSAPP_CALLING.HOW_IT_WORKS.DESCRIPTION')"
    />

    <div>
      <NextButton
        :is-loading="isUpdating"
        :label="$t('INBOX_MGMT.SETTINGS_POPUP.UPDATE')"
        @click="updateCallingSettings"
      />
    </div>
  </div>
</template>
