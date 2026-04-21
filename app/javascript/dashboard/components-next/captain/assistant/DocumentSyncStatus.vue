<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { dynamicTime } from 'shared/helpers/timeHelper';

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

const isSyncing = computed(() => props.status === 'syncing');
const isFailed = computed(() => props.status === 'failed');
const hasBeenSynced = computed(() => Boolean(props.lastSyncedAt));

const relativeTime = computed(() =>
  hasBeenSynced.value ? dynamicTime(props.lastSyncedAt) : ''
);

const errorLabel = computed(() => {
  const code =
    props.errorCode && KNOWN_ERROR_CODES.includes(props.errorCode)
      ? props.errorCode.toUpperCase()
      : 'DEFAULT';
  return t(`CAPTAIN.DOCUMENTS.SYNC_ERRORS.${code}`);
});

const label = computed(() => {
  if (isSyncing.value) return t('CAPTAIN.DOCUMENTS.SYNC_STATUS.SYNCING');
  if (isFailed.value)
    return t('CAPTAIN.DOCUMENTS.SYNC_STATUS.FAILED', {
      error: errorLabel.value,
    });
  if (hasBeenSynced.value)
    return t('CAPTAIN.DOCUMENTS.SYNC_STATUS.SYNCED', {
      time: relativeTime.value,
    });
  return t('CAPTAIN.DOCUMENTS.SYNC_STATUS.NEVER_SYNCED');
});

const tone = computed(() => {
  if (isSyncing.value) return 'amber';
  if (isFailed.value) return 'ruby';
  if (hasBeenSynced.value) return 'emerald';
  return 'slate';
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
    class="flex gap-1.5 items-center text-xs truncate shrink-0"
    :class="textClass"
    :title="label"
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
