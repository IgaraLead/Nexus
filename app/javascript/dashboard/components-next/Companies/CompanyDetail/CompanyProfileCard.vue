<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
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
const SOCIAL_LINK_FIELDS = [
  {
    key: 'linkedin',
    icon: 'i-ri-linkedin-box-fill',
    label: t('COMPANIES.DETAIL.PROFILE.FIELDS.LINKEDIN_URL'),
    placeholder: t('COMPANIES.DETAIL.PROFILE.PLACEHOLDERS.LINKEDIN_URL'),
  },
  {
    key: 'twitter',
    icon: 'i-ri-twitter-x-fill',
    label: t('COMPANIES.DETAIL.PROFILE.FIELDS.TWITTER_URL'),
    placeholder: t('COMPANIES.DETAIL.PROFILE.PLACEHOLDERS.TWITTER_URL'),
  },
  {
    key: 'github',
    icon: 'i-ri-github-fill',
    label: t('COMPANIES.DETAIL.PROFILE.FIELDS.GITHUB_URL'),
    placeholder: t('COMPANIES.DETAIL.PROFILE.PLACEHOLDERS.GITHUB_URL'),
  },
  {
    key: 'instagram',
    icon: 'i-ri-instagram-line',
    label: t('COMPANIES.DETAIL.PROFILE.FIELDS.INSTAGRAM_URL'),
    placeholder: t('COMPANIES.DETAIL.PROFILE.PLACEHOLDERS.INSTAGRAM_URL'),
  },
];

const editableName = ref('');
const editableDomain = ref('');
const editableDescription = ref('');
const editableLinkedinUrl = ref('');
const editableTwitterUrl = ref('');
const editableGithubUrl = ref('');
const editableInstagramUrl = ref('');
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
const hasChanges = computed(() => {
  return (
    editableName.value.trim() !== `${props.company?.name || ''}`.trim() ||
    editableDomain.value.trim() !== `${props.company?.domain || ''}`.trim() ||
    editableDescription.value.trim() !==
      `${props.company?.description || ''}`.trim() ||
    editableLinkedinUrl.value.trim() !==
      `${socialProfiles.value.linkedin || ''}`.trim() ||
    editableTwitterUrl.value.trim() !==
      `${socialProfiles.value.twitter || ''}`.trim() ||
    editableGithubUrl.value.trim() !==
      `${socialProfiles.value.github || ''}`.trim() ||
    editableInstagramUrl.value.trim() !==
      `${socialProfiles.value.instagram || ''}`.trim()
  );
});

const formatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const formatDate = value => {
  if (!value) {
    return t('COMPANIES.DETAIL.PROFILE.NOT_PROVIDED');
  }

  return formatter.format(new Date(value));
};

const syncEditableFields = company => {
  const companySocialProfiles =
    company?.additionalAttributes?.socialProfiles || {};

  editableName.value = company?.name || '';
  editableDomain.value = company?.domain || '';
  editableDescription.value = company?.description || '';
  editableLinkedinUrl.value = companySocialProfiles.linkedin || '';
  editableTwitterUrl.value = companySocialProfiles.twitter || '';
  editableGithubUrl.value = companySocialProfiles.github || '';
  editableInstagramUrl.value = companySocialProfiles.instagram || '';
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
  const items = [
    t('COMPANIES.CONTACTS_COUNT', {
      n: Number(props.company?.contactsCount || 0),
    }),
    `${t('COMPANIES.DETAIL.PROFILE.FIELDS.CREATED_AT')} ${formatDate(
      props.company?.createdAt
    )}`,
    `${t('COMPANIES.DETAIL.PROFILE.FIELDS.UPDATED_AT')} ${formatDate(
      props.company?.updatedAt
    )}`,
  ];

  if (props.company?.domain) {
    items.unshift(props.company.domain);
  }

  return items;
});

const socialLinkInputs = computed(() => [
  {
    key: 'linkedin',
    label: SOCIAL_LINK_FIELDS[0].label,
    icon: SOCIAL_LINK_FIELDS[0].icon,
    model: editableLinkedinUrl,
    placeholder: SOCIAL_LINK_FIELDS[0].placeholder,
  },
  {
    key: 'twitter',
    label: SOCIAL_LINK_FIELDS[1].label,
    icon: SOCIAL_LINK_FIELDS[1].icon,
    model: editableTwitterUrl,
    placeholder: SOCIAL_LINK_FIELDS[1].placeholder,
  },
  {
    key: 'github',
    label: SOCIAL_LINK_FIELDS[2].label,
    icon: SOCIAL_LINK_FIELDS[2].icon,
    model: editableGithubUrl,
    placeholder: SOCIAL_LINK_FIELDS[2].placeholder,
  },
  {
    key: 'instagram',
    label: SOCIAL_LINK_FIELDS[3].label,
    icon: SOCIAL_LINK_FIELDS[3].icon,
    model: editableInstagramUrl,
    placeholder: SOCIAL_LINK_FIELDS[3].placeholder,
  },
]);

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
        socialProfiles: {
          ...socialProfiles.value,
          linkedin: editableLinkedinUrl.value.trim(),
          twitter: editableTwitterUrl.value.trim(),
          github: editableGithubUrl.value.trim(),
          instagram: editableInstagramUrl.value.trim(),
        },
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
        <div class="flex flex-col gap-1">
          <h3 class="text-base font-medium text-n-slate-12">
            {{ displayName }}
          </h3>
        </div>

        <span class="text-sm leading-6 text-n-slate-11">
          {{ summaryItems.join(' • ') }}
        </span>

        <p v-if="isAvatarActionInFlight" class="text-sm text-n-slate-11">
          {{ t('COMPANIES.DETAIL.AVATAR.UPDATING') }}
        </p>
      </div>
    </div>

    <div class="flex flex-col items-start w-full gap-6">
      <div class="flex flex-col gap-1">
        <h3 class="text-base font-medium text-n-slate-12">
          {{ t('COMPANIES.DETAIL.PROFILE.TITLE') }}
        </h3>
      </div>

      <div class="grid w-full gap-6 sm:grid-cols-2">
        <Input
          v-model="editableName"
          :label="t('COMPANIES.DETAIL.PROFILE.FIELDS.NAME')"
          :placeholder="t('COMPANIES.UNNAMED')"
          :disabled="isUpdating"
        />

        <Input
          v-model="editableDomain"
          :label="t('COMPANIES.DETAIL.PROFILE.FIELDS.DOMAIN')"
          :placeholder="t('COMPANIES.DETAIL.PROFILE.NOT_PROVIDED')"
          :disabled="isUpdating"
        />
      </div>

      <div class="flex flex-col w-full gap-3">
        <TextArea
          v-model="editableDescription"
          :label="t('COMPANIES.DETAIL.PROFILE.FIELDS.DESCRIPTION')"
          :placeholder="t('COMPANIES.DETAIL.PROFILE.DESCRIPTION_PLACEHOLDER')"
          :disabled="isUpdating"
          :max-length="280"
          show-character-count
          auto-height
        />
      </div>

      <div class="flex flex-col items-start gap-2">
        <span class="py-1 text-sm font-medium text-n-slate-12">
          {{ t('COMPANIES.DETAIL.PROFILE.FIELDS.SOCIAL_LINKS') }}
        </span>

        <div class="flex flex-wrap gap-2">
          <div
            v-for="field in socialLinkInputs"
            :key="field.key"
            class="flex items-center h-8 gap-2 px-2 rounded-lg bg-n-alpha-2 dark:bg-n-solid-2"
          >
            <Icon
              :icon="field.icon"
              class="flex-shrink-0 text-n-slate-11 size-4"
            />
            <input
              v-model="field.model.value"
              type="url"
              :aria-label="field.label"
              :disabled="isUpdating"
              :placeholder="field.placeholder"
              class="w-auto min-w-[100px] text-sm bg-transparent outline-none reset-base text-n-slate-12 dark:text-n-slate-12 placeholder:text-n-slate-10 dark:placeholder:text-n-slate-10 disabled:opacity-60"
              :size="field.placeholder.length"
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
