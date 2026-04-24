<script setup>
import { computed, useTemplateRef, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { dynamicTime } from 'shared/helpers/timeHelper';
import { useToggle } from '@vueuse/core';
import { useMessageFormatter } from 'shared/composables/useMessageFormatter';
import Avatar from 'dashboard/components-next/avatar/Avatar.vue';
import Button from 'dashboard/components-next/button/Button.vue';

const props = defineProps({
  note: {
    type: Object,
    required: true,
  },
  writtenBy: {
    type: String,
    required: true,
  },
  avatarName: {
    type: String,
    default: '',
  },
  avatarSrc: {
    type: String,
    default: '',
  },
  metadataLabel: {
    type: String,
    default: '',
  },
  metadataPrefix: {
    type: String,
    default: '',
  },
  metadataValue: {
    type: String,
    default: '',
  },
  writtenByClickable: {
    type: Boolean,
    default: false,
  },
  metadataValueClickable: {
    type: Boolean,
    default: false,
  },
  allowDelete: {
    type: Boolean,
    default: false,
  },
  collapsible: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['delete', 'writtenByClick', 'metadataClick']);
const noteContentRef = useTemplateRef('noteContentRef');
const needsCollapse = ref(false);
const [isExpanded, toggleExpanded] = useToggle();
const { t } = useI18n();
const { formatMessage } = useMessageFormatter();
const noteMetaSeparator = '•';
const displayAvatarName = computed(
  () => props.avatarName || props.note?.user?.name || 'Bot'
);
const displayAvatarSrc = computed(() => {
  if (props.avatarSrc) {
    return props.avatarSrc;
  }

  return props.note?.user?.name
    ? props.note?.user?.thumbnail
    : '/assets/images/chatwoot_bot.png';
});
const hasMetadata = computed(() => props.metadataLabel || props.metadataValue);

const handleDelete = () => {
  emit('delete', props.note.id);
};

const handleWrittenByClick = () => {
  emit('writtenByClick');
};

const handleMetadataClick = () => {
  emit('metadataClick');
};

onMounted(() => {
  if (props.collapsible) {
    // Check if content height exceeds approximately 4 lines
    // Assuming line height is ~1.625 and font size is ~14px
    const threshold = 14 * 1.625 * 4; // ~84px
    needsCollapse.value = noteContentRef.value?.clientHeight > threshold;
  }
});
</script>

<template>
  <div class="flex flex-col gap-2 border-b border-n-strong group/note">
    <div class="flex items-start justify-between gap-2">
      <div class="flex items-center min-w-0 gap-1.5">
        <Avatar
          :name="displayAvatarName"
          :src="displayAvatarSrc"
          :size="16"
          class="flex-shrink-0"
          rounded-full
        />
        <div class="min-w-0 text-sm leading-4 truncate text-n-slate-11">
          <button
            v-if="writtenByClickable"
            type="button"
            class="reset-base inline !p-0 !m-0 font-medium leading-4 align-baseline text-n-slate-12 hover:text-n-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-n-brand rounded-sm"
            @click.stop="handleWrittenByClick"
          >
            {{ writtenBy }}
          </button>
          <span v-else class="font-medium leading-4 text-n-slate-12">
            {{ writtenBy }}
          </span>
          <template v-if="hasMetadata">
            <span class="text-n-slate-10">
              {{ ` ${noteMetaSeparator} ` }}
            </span>
            <template v-if="metadataValue">
              <span v-if="metadataPrefix"> {{ metadataPrefix }}{{ ' ' }} </span>
              <button
                v-if="metadataValueClickable"
                type="button"
                class="reset-base inline !p-0 !m-0 leading-4 align-baseline hover:text-n-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-n-brand rounded-sm"
                @click.stop="handleMetadataClick"
              >
                {{ metadataValue }}
              </button>
              <span v-else>{{ metadataValue }}</span>
            </template>
            <span v-else>{{ metadataLabel }}</span>
            <span class="text-n-slate-10">
              {{ ` ${noteMetaSeparator} ` }}
            </span>
          </template>
          <template v-else>
            {{ t('CONTACTS_LAYOUT.SIDEBAR.NOTES.WROTE') }}
          </template>
          <span class="font-medium leading-4 text-n-slate-12">
            {{ dynamicTime(note.createdAt) }}
          </span>
        </div>
      </div>
      <Button
        v-if="allowDelete"
        variant="faded"
        color="ruby"
        size="xs"
        icon="i-lucide-trash"
        class="opacity-0 group-hover/note:opacity-100"
        @click="handleDelete"
      />
    </div>
    <p
      ref="noteContentRef"
      v-dompurify-html="formatMessage(note.content || '')"
      class="mb-0 prose-sm prose-p:text-sm prose-p:leading-relaxed prose-p:mb-1 prose-p:mt-0 prose-ul:mb-1 prose-ul:mt-0 text-n-slate-12"
      :class="{
        'line-clamp-4': collapsible && !isExpanded && needsCollapse,
      }"
    />
    <p v-if="collapsible && needsCollapse">
      <Button
        variant="faded"
        color="blue"
        size="xs"
        :icon="isExpanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        @click="() => toggleExpanded()"
      >
        <template v-if="isExpanded">
          {{ t('CONTACTS_LAYOUT.SIDEBAR.NOTES.COLLAPSE') }}
        </template>
        <template v-else>
          {{ t('CONTACTS_LAYOUT.SIDEBAR.NOTES.EXPAND') }}
        </template>
      </Button>
    </p>
  </div>
</template>
