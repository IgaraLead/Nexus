<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatDistanceToNow } from 'date-fns';
import { useAlert } from 'dashboard/composables';

import Avatar from 'dashboard/components-next/avatar/Avatar.vue';
import Button from 'dashboard/components-next/button/Button.vue';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import Input from 'dashboard/components-next/input/Input.vue';
import TextArea from 'dashboard/components-next/textarea/TextArea.vue';
import { useCompaniesStore } from 'dashboard/stores/companies';

const props = defineProps({
  company: {
    type: Object,
    default: () => ({}),
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
});

const { t } = useI18n();
const companiesStore = useCompaniesStore();

const SOCIAL_PROFILES = [
  ['linkedin', 'i-ri-linkedin-box-fill'],
  ['facebook', 'i-ri-facebook-circle-fill'],
  ['instagram', 'i-ri-instagram-line'],
  ['telegram', 'i-ri-telegram-fill'],
  ['tiktok', 'i-ri-tiktok-fill'],
  ['twitter', 'i-ri-twitter-x-fill'],
  ['github', 'i-ri-github-fill'],
];

const editableName = ref('');
const editableDomain = ref('');
const editableDescription = ref('');
const editableSocialProfiles = ref({});
const avatarPreviewUrl = ref('');
const isUploadingAvatar = ref(false);

const uiFlags = computed(() => companiesStore.getUIFlags);
const isUpdating = computed(() => uiFlags.value.updatingItem);
const isDeletingAvatar = computed(() => uiFlags.value.deletingAvatar);
const isAvatarActionInFlight = computed(
  () => isUploadingAvatar.value || isDeletingAvatar.value
);
const isAvatarBusy = computed(
  () => isAvatarActionInFlight.value || isUpdating.value
);
const canRenderForm = computed(() => Boolean(props.company?.id));
const displayName = computed(
  () => props.company?.name || t('COMPANIES.UNNAMED')
);
const avatarSource = computed(
  () => avatarPreviewUrl.value || props.company?.avatarUrl || ''
);
const socialProfiles = computed(
  () => props.company?.additionalAttributes?.socialProfiles || {}
);
const isFormInvalid = computed(() => !editableName.value.trim());
const normalizeSocialProfiles = profiles => ({
  ...Object.fromEntries(SOCIAL_PROFILES.map(([key]) => [key, ''])),
  ...(profiles || {}),
});
const hasChanges = computed(() => {
  const currentSocialProfiles = normalizeSocialProfiles(socialProfiles.value);
  const nextSocialProfiles = normalizeSocialProfiles(
    editableSocialProfiles.value
  );

  return (
    editableName.value.trim() !== `${props.company?.name || ''}`.trim() ||
    editableDomain.value.trim() !== `${props.company?.domain || ''}`.trim() ||
    editableDescription.value.trim() !==
      `${props.company?.description || ''}`.trim() ||
    Object.keys(nextSocialProfiles).some(
      key =>
        `${nextSocialProfiles[key] || ''}`.trim() !==
        `${currentSocialProfiles[key] || ''}`.trim()
    )
  );
});

const syncEditableFields = company => {
  const companySocialProfiles =
    company?.additionalAttributes?.socialProfiles || {};

  editableName.value = company?.name || '';
  editableDomain.value = company?.domain || '';
  editableDescription.value = company?.description || '';
  editableSocialProfiles.value = normalizeSocialProfiles(companySocialProfiles);
};

watch(
  () => [
    props.company?.id,
    props.company?.name,
    props.company?.domain,
    props.company?.description,
    props.company?.additionalAttributes,
    props.company?.avatarUrl,
  ],
  () => {
    avatarPreviewUrl.value = '';
    syncEditableFields(props.company);
  },
  { immediate: true }
);

const summaryItems = computed(() => {
  const createdAt = props.company?.createdAt
    ? t('COMPANIES.DETAIL.PROFILE.CREATED_AT', {
        date: formatDistanceToNow(new Date(props.company.createdAt), {
          addSuffix: true,
        }),
      })
    : '';
  const lastActiveAt = props.company?.lastActivityAt
    ? t('COMPANIES.DETAIL.PROFILE.LAST_ACTIVE', {
        date: formatDistanceToNow(new Date(props.company.lastActivityAt), {
          addSuffix: true,
        }),
      })
    : '';

  return [createdAt, lastActiveAt].filter(Boolean);
});

const socialProfilesForm = computed(() =>
  [
    t('CONTACTS_LAYOUT.CARD.SOCIAL_MEDIA.FORM.LINKEDIN.PLACEHOLDER'),
    t('CONTACTS_LAYOUT.CARD.SOCIAL_MEDIA.FORM.FACEBOOK.PLACEHOLDER'),
    t('CONTACTS_LAYOUT.CARD.SOCIAL_MEDIA.FORM.INSTAGRAM.PLACEHOLDER'),
    t('CONTACTS_LAYOUT.CARD.SOCIAL_MEDIA.FORM.TELEGRAM.PLACEHOLDER'),
    t('CONTACTS_LAYOUT.CARD.SOCIAL_MEDIA.FORM.TIKTOK.PLACEHOLDER'),
    t('CONTACTS_LAYOUT.CARD.SOCIAL_MEDIA.FORM.TWITTER.PLACEHOLDER'),
    t('CONTACTS_LAYOUT.CARD.SOCIAL_MEDIA.FORM.GITHUB.PLACEHOLDER'),
  ].map((placeholder, index) => ({
    key: SOCIAL_PROFILES[index][0],
    icon: SOCIAL_PROFILES[index][1],
    placeholder,
  }))
);

const handleAvatarUpload = async ({ file, url }) => {
  if (!props.company?.id || isAvatarBusy.value) {
    return;
  }

  avatarPreviewUrl.value = url;
  isUploadingAvatar.value = true;

  try {
    await companiesStore.update({
      id: props.company.id,
      avatar: file,
    });
    useAlert(t('COMPANIES.DETAIL.AVATAR.UPLOAD_SUCCESS'));
  } catch {
    avatarPreviewUrl.value = '';
    useAlert(t('COMPANIES.DETAIL.AVATAR.UPLOAD_ERROR'));
  } finally {
    isUploadingAvatar.value = false;
  }
};

const handleAvatarDelete = async () => {
  if (!props.company?.id || isAvatarBusy.value) {
    return;
  }

  try {
    await companiesStore.deleteCompanyAvatar(props.company.id);
    avatarPreviewUrl.value = '';
    useAlert(t('COMPANIES.DETAIL.AVATAR.DELETE_SUCCESS'));
  } catch {
    useAlert(t('COMPANIES.DETAIL.AVATAR.DELETE_ERROR'));
  }
};

const handleUpdateCompany = async () => {
  if (!props.company?.id || isFormInvalid.value || !hasChanges.value) {
    return;
  }

  try {
    const updatedCompany = await companiesStore.update({
      id: props.company.id,
      name: editableName.value.trim(),
      domain: editableDomain.value.trim(),
      description: editableDescription.value.trim(),
      additionalAttributes: {
        ...(props.company?.additionalAttributes || {}),
        socialProfiles: normalizeSocialProfiles(editableSocialProfiles.value),
      },
    });
    syncEditableFields(updatedCompany);
    useAlert(t('COMPANIES.DETAIL.PROFILE.MESSAGES.UPDATE_SUCCESS'));
  } catch {
    syncEditableFields(props.company);
    useAlert(t('COMPANIES.DETAIL.PROFILE.MESSAGES.UPDATE_ERROR'));
  }
};
</script>

<template>
  <div v-if="isLoading && !company?.id" class="text-sm text-n-slate-11">
    {{ t('COMPANIES.DETAIL.LOADING') }}
  </div>

  <div v-else-if="canRenderForm" class="flex flex-col items-start gap-8 pb-6">
    <div class="flex flex-col items-start gap-3">
      <Avatar
        :name="displayName"
        :src="avatarSource"
        :size="72"
        :allow-upload="Boolean(company?.id) && !isAvatarBusy"
        rounded-full
        hide-offline-status
        @upload="handleAvatarUpload"
        @delete="handleAvatarDelete"
      />

      <div class="flex flex-col gap-1">
        <h3 class="text-base font-medium text-n-slate-12">
          {{ displayName }}
        </h3>

        <span
          v-if="summaryItems.length"
          class="text-sm leading-6 text-n-slate-11"
        >
          {{ summaryItems.join(' • ') }}
        </span>

        <p v-if="isAvatarActionInFlight" class="text-sm text-n-slate-11">
          {{ t('COMPANIES.DETAIL.AVATAR.UPDATING') }}
        </p>
      </div>
    </div>

    <div class="flex flex-col items-start w-full gap-6">
      <div class="flex flex-col gap-1">
        <span class="py-1 text-sm font-medium text-n-slate-12">
          {{ t('COMPANIES.DETAIL.PROFILE.TITLE') }}
        </span>
      </div>

      <div class="grid w-full gap-4 sm:grid-cols-2">
        <Input
          v-model="editableName"
          :placeholder="t('COMPANIES.DETAIL.PROFILE.FIELDS.NAME')"
          :disabled="isUpdating"
          custom-input-class="h-8 !pt-1 !pb-1"
        />

        <Input
          v-model="editableDomain"
          :placeholder="t('COMPANIES.DETAIL.PROFILE.FIELDS.DOMAIN')"
          :disabled="isUpdating"
          custom-input-class="h-8 !pt-1 !pb-1"
        />
      </div>

      <div class="flex flex-col w-full gap-2">
        <TextArea
          v-model="editableDescription"
          :placeholder="t('COMPANIES.DETAIL.PROFILE.DESCRIPTION_PLACEHOLDER')"
          :disabled="isUpdating"
          :max-length="280"
          show-character-count
          auto-height
        />
      </div>

      <div class="flex flex-col items-start gap-2">
        <span class="py-1 text-sm font-medium text-n-slate-12">
          {{ t('CONTACTS_LAYOUT.CARD.SOCIAL_MEDIA.TITLE') }}
        </span>

        <div class="flex flex-wrap gap-2">
          <div
            v-for="item in socialProfilesForm"
            :key="item.key"
            class="flex items-center h-8 gap-2 px-2 rounded-lg bg-n-alpha-2 dark:bg-n-solid-2"
          >
            <Icon
              :icon="item.icon"
              class="flex-shrink-0 text-n-slate-11 size-4"
            />
            <input
              v-model="editableSocialProfiles[item.key]"
              :disabled="isUpdating"
              class="w-auto min-w-[100px] text-sm bg-transparent outline-none reset-base text-n-slate-12 dark:text-n-slate-12 placeholder:text-n-slate-10 dark:placeholder:text-n-slate-10 disabled:cursor-not-allowed disabled:opacity-50"
              :placeholder="item.placeholder"
              :size="item.placeholder.length"
            />
          </div>
        </div>
      </div>

      <div class="flex items-center">
        <Button
          :label="t('COMPANIES.DETAIL.PROFILE.ACTIONS.SAVE')"
          size="sm"
          :is-loading="isUpdating"
          :disabled="isUpdating || isFormInvalid || !hasChanges"
          @click="handleUpdateCompany"
        />
      </div>
    </div>
  </div>
</template>
