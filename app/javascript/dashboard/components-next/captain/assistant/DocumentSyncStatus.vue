<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { dynamicTime } from 'shared/helpers/timeHelper';
import Button from 'dashboard/components-next/button/Button.vue';

const props = defineProps({
  status: {
    type: String,
    default: null,
  },
  lastSyncedAt: {
    type: Number,
    default: null,
  },
  errorCode: {
    type: String,
    default: null,
  },
  showRetry: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['retry']);
const { t } = useI18n();

const STALE_AFTER_DAYS = 7;
const VERY_STALE_AFTER_DAYS = 30;
const SECONDS_PER_DAY = 86400;

const SYNCING = 'syncing';
const FAILED = 'failed';

const ERROR_CODE_LABELS = {
  not_found: 'CAPTAIN.DOCUMENTS.SYNC_ERRORS.NOT_FOUND',
  access_denied: 'CAPTAIN.DOCUMENTS.SYNC_ERRORS.ACCESS_DENIED',
  timeout: 'CAPTAIN.DOCUMENTS.SYNC_ERRORS.TIMEOUT',
  content_empty: 'CAPTAIN.DOCUMENTS.SYNC_ERRORS.CONTENT_EMPTY',
  fetch_failed: 'CAPTAIN.DOCUMENTS.SYNC_ERRORS.FETCH_FAILED',
  sync_error: 'CAPTAIN.DOCUMENTS.SYNC_ERRORS.SYNC_ERROR',
};
const DEFAULT_ERROR_LABEL = 'CAPTAIN.DOCUMENTS.SYNC_ERRORS.DEFAULT';

const isSyncing = computed(() => props.status === SYNCING);
const isFailed = computed(() => props.status === FAILED);
const hasBeenSynced = computed(() => Boolean(props.lastSyncedAt));

const ageInDays = computed(() => {
  if (!props.lastSyncedAt) return null;
  const nowSeconds = Date.now() / 1000;
  return (nowSeconds - props.lastSyncedAt) / SECONDS_PER_DAY;
});

const errorLabel = computed(() =>
  t(ERROR_CODE_LABELS[props.errorCode] || DEFAULT_ERROR_LABEL)
);

const label = computed(() => {
  if (isSyncing.value) return t('CAPTAIN.DOCUMENTS.SYNC_STATUS.SYNCING');
  if (isFailed.value)
    return t('CAPTAIN.DOCUMENTS.SYNC_STATUS.FAILED', {
      error: errorLabel.value,
    });
  if (hasBeenSynced.value)
    return t('CAPTAIN.DOCUMENTS.SYNC_STATUS.SYNCED', {
      time: dynamicTime(props.lastSyncedAt),
    });
  return t('CAPTAIN.DOCUMENTS.SYNC_STATUS.NEVER_SYNCED');
});

const fullLabel = computed(() => {
  if (isSyncing.value) return t('CAPTAIN.DOCUMENTS.SYNC_STATUS.SYNCING');
  if (isFailed.value)
    return t('CAPTAIN.DOCUMENTS.SYNC_STATUS.FAILED', {
      error: errorLabel.value,
    });
  if (hasBeenSynced.value)
    return t('CAPTAIN.DOCUMENTS.SYNC_STATUS.SYNCED', {
      time: dynamicTime(props.lastSyncedAt),
    });
  return t('CAPTAIN.DOCUMENTS.SYNC_STATUS.NEVER_SYNCED');
});

const tone = computed(() => {
  if (isSyncing.value) return 'amber';
  if (isFailed.value) return 'ruby';
  if (!hasBeenSynced.value) return 'slate';
  if (ageInDays.value >= VERY_STALE_AFTER_DAYS) return 'ruby';
  if (ageInDays.value >= STALE_AFTER_DAYS) return 'amber';
  return 'emerald';
});

const dotClass = computed(() => {
  if (tone.value === 'amber') return 'bg-n-amber-9';
  if (tone.value === 'ruby') return 'bg-n-ruby-9';
  if (tone.value === 'emerald') return 'bg-n-teal-9';
  return 'bg-n-slate-9';
});

const textClass = computed(() => {
  if (tone.value === 'amber') return 'text-n-amber-11';
  if (tone.value === 'ruby') return 'text-n-ruby-11';
  if (tone.value === 'emerald') return 'text-n-teal-11';
  return 'text-n-slate-11';
});
</script>

<template>
  <span
    class="flex gap-1.5 items-center text-xs truncate shrink-0 tabular-nums"
    :class="textClass"
    :title="fullLabel"
  >
    <span
      v-if="isSyncing"
      class="inline-block size-3 rounded-full border-2 border-n-amber-9 border-t-transparent animate-spin"
    />
    <span
      v-else
      class="inline-block size-2 rounded-full shrink-0"
      :class="dotClass"
    />
    <span class="truncate">{{ label }}</span>
    <Button
      v-if="showRetry && isFailed"
      :label="t('CAPTAIN.DOCUMENTS.OPTIONS.RETRY_SYNC')"
      xs
      link
      ruby
      icon="i-lucide-refresh-cw"
      class="hover:!no-underline !gap-1 ms-1"
      @click.stop="emit('retry')"
    />
  </span>
</template>
