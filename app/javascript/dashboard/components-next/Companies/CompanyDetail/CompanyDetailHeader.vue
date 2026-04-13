<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';

import Avatar from 'dashboard/components-next/avatar/Avatar.vue';
import Breadcrumb from 'dashboard/components-next/breadcrumb/Breadcrumb.vue';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { useCompaniesStore } from 'dashboard/stores/companies';

const props = defineProps({
  company: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(['back']);

const { t } = useI18n();
const companiesStore = useCompaniesStore();

const avatarPreviewUrl = ref('');
const isUploadingAvatar = ref(false);

const uiFlags = computed(() => companiesStore.getUIFlags);
const isDeletingAvatar = computed(() => uiFlags.value.deletingAvatar);
const isAvatarActionInFlight = computed(
  () => isUploadingAvatar.value || isDeletingAvatar.value
);
const isAvatarBusy = computed(
  () => isAvatarActionInFlight.value || uiFlags.value.updatingItem
);

const displayName = computed(
  () => props.company?.name || t('COMPANIES.UNNAMED')
);
const avatarSource = computed(
  () => avatarPreviewUrl.value || props.company?.avatarUrl || ''
);

const breadcrumbItems = computed(() => [
  {
    label: t('COMPANIES.HEADER'),
  },
  {
    label: displayName.value,
  },
]);

const summaryItems = computed(() => {
  const items = [];

  if (props.company?.domain) {
    items.push({
      icon: 'i-lucide-globe',
      label: props.company.domain,
    });
  }

  if (props.company?.contactsCount) {
    items.push({
      icon: 'i-lucide-contact',
      label: t('COMPANIES.CONTACTS_COUNT', {
        n: props.company.contactsCount,
      }),
    });
  }

  return items;
});

watch(
  () => props.company?.avatarUrl,
  () => {
    avatarPreviewUrl.value = '';
  }
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
</script>

<template>
  <header
    class="sticky top-0 z-10 px-6 border-b border-n-weak bg-n-surface-1/95 backdrop-blur"
  >
    <div class="w-full max-w-6xl py-6 mx-auto">
      <Breadcrumb :items="breadcrumbItems" @click="emit('back')" />
      <div
        class="flex flex-col gap-4 pt-4 sm:flex-row sm:items-start sm:justify-between"
      >
        <div class="flex items-start gap-4 min-w-0">
          <Avatar
            :name="displayName"
            :src="avatarSource"
            :size="56"
            :allow-upload="Boolean(company?.id) && !isAvatarBusy"
            rounded-full
            hide-offline-status
            @upload="handleAvatarUpload"
            @delete="handleAvatarDelete"
          />
          <div class="min-w-0">
            <h1 class="text-2xl font-semibold text-n-slate-12">
              {{ displayName }}
            </h1>
            <p
              v-if="company?.description"
              class="pt-1 text-sm leading-6 text-n-slate-11"
            >
              {{ company.description }}
            </p>
            <div
              v-if="summaryItems.length"
              class="flex flex-wrap items-center gap-3 pt-3"
            >
              <span
                v-for="item in summaryItems"
                :key="`${item.icon}-${item.label}`"
                class="inline-flex items-center gap-1.5 px-3 py-1 text-sm rounded-full bg-n-alpha-2 text-n-slate-11"
              >
                <Icon :icon="item.icon" class="size-4" />
                {{ item.label }}
              </span>
            </div>
            <p
              v-if="isAvatarActionInFlight"
              class="pt-2 text-sm text-n-slate-11"
            >
              {{ t('COMPANIES.DETAIL.AVATAR.UPDATING') }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>
