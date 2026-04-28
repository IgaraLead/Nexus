<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import Icon from 'dashboard/components-next/icon/Icon.vue';

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({}),
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  isDetailsView: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:modelValue']);

const { t } = useI18n();

const socialProfilesForm = computed(() => [
  {
    key: 'linkedin',
    placeholder: t(
      'CONTACTS_LAYOUT.CARD.SOCIAL_MEDIA.FORM.LINKEDIN.PLACEHOLDER'
    ),
    icon: 'i-ri-linkedin-box-fill',
  },
  {
    key: 'facebook',
    placeholder: t(
      'CONTACTS_LAYOUT.CARD.SOCIAL_MEDIA.FORM.FACEBOOK.PLACEHOLDER'
    ),
    icon: 'i-ri-facebook-circle-fill',
  },
  {
    key: 'instagram',
    placeholder: t(
      'CONTACTS_LAYOUT.CARD.SOCIAL_MEDIA.FORM.INSTAGRAM.PLACEHOLDER'
    ),
    icon: 'i-ri-instagram-line',
  },
  {
    key: 'telegram',
    placeholder: t(
      'CONTACTS_LAYOUT.CARD.SOCIAL_MEDIA.FORM.TELEGRAM.PLACEHOLDER'
    ),
    icon: 'i-ri-telegram-fill',
  },
  {
    key: 'tiktok',
    placeholder: t('CONTACTS_LAYOUT.CARD.SOCIAL_MEDIA.FORM.TIKTOK.PLACEHOLDER'),
    icon: 'i-ri-tiktok-fill',
  },
  {
    key: 'twitter',
    placeholder: t(
      'CONTACTS_LAYOUT.CARD.SOCIAL_MEDIA.FORM.TWITTER.PLACEHOLDER'
    ),
    icon: 'i-ri-twitter-x-fill',
  },
  {
    key: 'github',
    placeholder: t('CONTACTS_LAYOUT.CARD.SOCIAL_MEDIA.FORM.GITHUB.PLACEHOLDER'),
    icon: 'i-ri-github-fill',
  },
]);

const updateSocialProfile = (key, value) => {
  emit('update:modelValue', {
    ...props.modelValue,
    [key]: value,
  });
};
</script>

<template>
  <div class="flex flex-col items-start gap-2">
    <span class="py-1 text-sm font-medium text-n-slate-12">
      {{ t('CONTACTS_LAYOUT.CARD.SOCIAL_MEDIA.TITLE') }}
    </span>
    <div class="flex flex-wrap gap-2">
      <div
        v-for="item in socialProfilesForm"
        :key="item.key"
        class="flex items-center h-8 gap-2 px-2 rounded-lg"
        :class="{
          'bg-n-alpha-2 dark:bg-n-solid-2': isDetailsView,
          'bg-n-alpha-2 dark:bg-n-solid-3': !isDetailsView,
        }"
      >
        <Icon :icon="item.icon" class="flex-shrink-0 text-n-slate-11 size-4" />
        <input
          :value="modelValue[item.key] || ''"
          :disabled="disabled"
          class="w-auto min-w-[100px] text-sm bg-transparent outline-none reset-base text-n-slate-12 dark:text-n-slate-12 placeholder:text-n-slate-10 dark:placeholder:text-n-slate-10 disabled:cursor-not-allowed disabled:opacity-50"
          :placeholder="item.placeholder"
          :size="item.placeholder.length"
          @input="updateSocialProfile(item.key, $event.target.value)"
        />
      </div>
    </div>
  </div>
</template>
