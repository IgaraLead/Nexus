<script>
import { mapGetters } from 'vuex';
import { parseBoolean } from '@chatwoot/utils';
import Banner from 'dashboard/components/ui/Banner.vue';
import mfaAPI from 'dashboard/api/mfa';

const LOW_BACKUP_CODES_THRESHOLD = 3;

export default {
  components: { Banner },
  data() {
    return {
      mfaEnabled: false,
      remainingBackupCodes: null,
    };
  },
  computed: {
    ...mapGetters({ currentAccountId: 'getCurrentAccountId' }),
    shouldShowBanner() {
      if (!this.mfaEnabled) return false;
      if (this.remainingBackupCodes === null) return false;
      return this.remainingBackupCodes <= LOW_BACKUP_CODES_THRESHOLD;
    },
    bannerColorScheme() {
      return this.remainingBackupCodes === 0 ? 'alert' : 'warning';
    },
    bannerMessage() {
      if (this.remainingBackupCodes === 0) {
        return this.$t('MFA_SETTINGS.LOW_BACKUP_CODES.NONE_LEFT');
      }
      return this.$t('MFA_SETTINGS.LOW_BACKUP_CODES.MESSAGE', {
        count: this.remainingBackupCodes,
      });
    },
  },
  mounted() {
    this.fetchMfaStatus();
  },
  methods: {
    async fetchMfaStatus() {
      if (!parseBoolean(window.chatwootConfig?.isMfaEnabled)) return;

      try {
        const { data } = await mfaAPI.get();
        this.mfaEnabled = data.enabled;
        this.remainingBackupCodes = data.remaining_backup_codes ?? null;
      } catch {
        // ignore; banner stays hidden
      }
    },
    goToMfaSettings() {
      this.$router.push({
        name: 'profile_settings_mfa',
        params: { accountId: this.currentAccountId },
      });
    },
  },
};
</script>

<!-- eslint-disable-next-line vue/no-root-v-if -->
<template>
  <Banner
    v-if="shouldShowBanner"
    :color-scheme="bannerColorScheme"
    :banner-message="bannerMessage"
    :action-button-label="$t('MFA_SETTINGS.LOW_BACKUP_CODES.ACTION')"
    action-button-icon="i-lucide-key"
    has-action-button
    @primary-action="goToMfaSettings"
  />
</template>
