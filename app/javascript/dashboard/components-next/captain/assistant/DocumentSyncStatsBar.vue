<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import Icon from 'dashboard/components-next/icon/Icon.vue';

const props = defineProps({
  stats: {
    type: Object,
    default: null,
  },
  activeFilter: {
    type: String,
    default: null,
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
  syncFrequencyLabel: {
    type: String,
    default: '',
  },
  isAutoSyncEligible: {
    type: Boolean,
    default: false,
  },
  isAutoSyncEnabled: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['select']);

const { t } = useI18n();

const items = computed(() => {
  const {
    total = 0,
    stale = 0,
    syncing = 0,
    synced_last_7_days: syncedRecently = 0,
  } = props.stats ?? {};
  return [
    {
      key: 'total',
      filterKey: null,
      label: t('CAPTAIN.DOCUMENTS.STATS.TOTAL'),
      value: total,
      icon: 'i-lucide-file',
      tone: 'slate',
    },
    {
      key: 'stale',
      filterKey: 'stale',
      label: t('CAPTAIN.DOCUMENTS.STATS.STALE'),
      value: stale,
      icon: 'i-lucide-alert-triangle',
      tone: stale > 0 ? 'amber' : 'slate',
    },
    {
      key: 'syncing',
      filterKey: 'syncing',
      label: t('CAPTAIN.DOCUMENTS.STATS.SYNCING'),
      value: syncing,
      icon: 'i-lucide-refresh-cw',
      tone: syncing > 0 ? 'amber' : 'slate',
    },
    {
      key: 'synced_last_7_days',
      filterKey: 'synced_last_7_days',
      label: t('CAPTAIN.DOCUMENTS.STATS.SYNCED_RECENTLY'),
      value: syncedRecently,
      icon: 'i-lucide-check-circle',
      tone: 'teal',
    },
  ];
});

const showPlaceholder = computed(() => props.isLoading || !props.stats);

const caption = computed(() => {
  if (props.syncFrequencyLabel) {
    return t('CAPTAIN.DOCUMENTS.STATS.CAPTION_AUTO', {
      frequency: props.syncFrequencyLabel,
    });
  }

  if (props.isAutoSyncEligible && !props.isAutoSyncEnabled) {
    return t('CAPTAIN.DOCUMENTS.STATS.CAPTION_DISABLED');
  }

  return t('CAPTAIN.DOCUMENTS.STATS.CAPTION_PLAN_UNAVAILABLE');
});

const isActive = item => props.activeFilter === item.filterKey;

const isDisabled = item =>
  showPlaceholder.value ||
  (item.filterKey !== null && item.value === 0 && !isActive(item));

const iconClass = (tone, active) => {
  if (active) return 'text-n-brand';
  if (tone === 'amber') return 'text-n-amber-11';
  if (tone === 'teal') return 'text-n-teal-11';
  return 'text-n-slate-11';
};

const handleSelect = item => {
  if (isDisabled(item)) return;
  emit('select', isActive(item) ? null : item.filterKey);
};
</script>

<template>
  <div class="flex flex-col gap-2 w-full">
    <div class="grid grid-cols-2 gap-3 w-full lg:grid-cols-4">
      <button
        v-for="item in items"
        :key="item.key"
        type="button"
        :disabled="isDisabled(item)"
        class="flex flex-col gap-2 px-4 py-3 rounded-xl outline -outline-offset-1 text-left transition-colors"
        :class="[
          isActive(item)
            ? 'outline-1 outline-n-brand bg-n-alpha-1'
            : 'outline-1 outline-n-container bg-n-solid-2',
          isDisabled(item)
            ? 'cursor-not-allowed opacity-60'
            : 'cursor-pointer hover:bg-n-alpha-2',
        ]"
        @click="handleSelect(item)"
      >
        <div class="flex gap-1.5 items-center">
          <Icon
            class="shrink-0 size-3"
            :icon="item.icon"
            :class="iconClass(item.tone, isActive(item))"
          />
          <span
            class="text-xs font-medium tracking-wide uppercase truncate text-n-slate-11"
          >
            {{ item.label }}
          </span>
        </div>
        <span
          class="text-2xl font-medium leading-none tabular-nums text-n-slate-12"
        >
          {{
            showPlaceholder
              ? t('CAPTAIN.DOCUMENTS.STATS.PLACEHOLDER')
              : item.value
          }}
        </span>
      </button>
    </div>
    <p class="text-xs text-n-slate-10">
      {{ caption }}
    </p>
  </div>
</template>
