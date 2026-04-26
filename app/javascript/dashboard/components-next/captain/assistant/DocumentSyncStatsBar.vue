<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

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
});

const emit = defineEmits(['select']);

const { t } = useI18n();

const items = computed(() => [
  {
    key: 'total',
    filterKey: null,
    label: t('CAPTAIN.DOCUMENTS.STATS.TOTAL'),
    value: props.stats?.total ?? 0,
    icon: 'i-lucide-file',
    tone: 'slate',
  },
  {
    key: 'stale',
    filterKey: 'stale',
    label: t('CAPTAIN.DOCUMENTS.STATS.STALE'),
    value: props.stats?.stale ?? 0,
    icon: 'i-lucide-alert-triangle',
    tone: (props.stats?.stale ?? 0) > 0 ? 'amber' : 'slate',
  },
  {
    key: 'syncing',
    filterKey: 'syncing',
    label: t('CAPTAIN.DOCUMENTS.STATS.SYNCING'),
    value: props.stats?.syncing ?? 0,
    icon: 'i-lucide-refresh-cw',
    tone: (props.stats?.syncing ?? 0) > 0 ? 'amber' : 'slate',
  },
  {
    key: 'synced_last_7_days',
    filterKey: 'synced_last_7_days',
    label: t('CAPTAIN.DOCUMENTS.STATS.SYNCED_RECENTLY'),
    value: props.stats?.synced_last_7_days ?? 0,
    icon: 'i-lucide-check-circle',
    tone: 'teal',
  },
]);

const showPlaceholder = computed(() => props.isLoading || !props.stats);

const isActive = item =>
  (props.activeFilter ?? null) === (item.filterKey ?? null);

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
        class="flex flex-col gap-2 px-4 py-3 rounded-xl outline -outline-offset-1 bg-n-solid-2 text-left transition-colors"
        :class="[
          isActive(item)
            ? 'outline-2 outline-n-brand bg-n-solid-3'
            : 'outline-1 outline-n-container',
          isDisabled(item)
            ? 'cursor-not-allowed opacity-60'
            : 'cursor-pointer hover:bg-n-solid-3',
        ]"
        @click="handleSelect(item)"
      >
        <div class="flex gap-1.5 items-center">
          <i
            class="shrink-0"
            :class="[item.icon, iconClass(item.tone, isActive(item))]"
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
          {{ showPlaceholder ? '—' : item.value }}
        </span>
      </button>
    </div>
    <p class="text-xs text-n-slate-10">
      {{ $t('CAPTAIN.DOCUMENTS.STATS.CAPTION') }}
    </p>
  </div>
</template>
