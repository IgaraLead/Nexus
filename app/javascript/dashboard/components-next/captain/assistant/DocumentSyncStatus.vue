<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { dynamicTime, shortTimestamp } from 'shared/helpers/timeHelper';

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
});

const { t } = useI18n();

const KNOWN_ERROR_CODES = [
  'not_found',
  'access_denied',
  'timeout',
  'content_empty',
  'fetch_failed',
  'sync_error',
];

const STALE_AFTER_DAYS = 7;
const VERY_STALE_AFTER_DAYS = 30;
const SECONDS_PER_DAY = 86400;

const isSyncing = computed(() => props.status === 'syncing');
const isFailed = computed(() => props.status === 'failed');
const hasBeenSynced = computed(() => Boolean(props.lastSyncedAt));

const ageInDays = computed(() => {
  if (!props.lastSyncedAt) return null;
  const nowSeconds = Date.now() / 1000;
  return (nowSeconds - props.lastSyncedAt) / SECONDS_PER_DAY;
});

const errorLabel = computed(() => {
  const code =
    props.errorCode && KNOWN_ERROR_CODES.includes(props.errorCode)
      ? props.errorCode.toUpperCase()
      : 'DEFAULT';
  return t(`CAPTAIN.DOCUMENTS.SYNC_ERRORS.${code}`);
});

// Compact label shown in the row (drops the "Synced" word for the synced state — that word repeats on every card)
const label = computed(() => {
  if (isSyncing.value) return t('CAPTAIN.DOCUMENTS.SYNC_STATUS.SYNCING');
  if (isFailed.value)
    return t('CAPTAIN.DOCUMENTS.SYNC_STATUS.FAILED', {
      error: errorLabel.value,
    });
  if (hasBeenSynced.value)
    return shortTimestamp(dynamicTime(props.lastSyncedAt), true);
  return t('CAPTAIN.DOCUMENTS.SYNC_STATUS.NEVER_SYNCED');
});

// Full label for hover tooltip — keeps the verbose form so the meaning stays explicit on demand
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
  </span>
</template>
