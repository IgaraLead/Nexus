<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import Dialog from 'dashboard/components-next/dialog/Dialog.vue';

const props = defineProps({
  contact: {
    type: Object,
    default: null,
  },
  fromCompany: {
    type: Object,
    default: null,
  },
  toCompany: {
    type: Object,
    default: null,
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['close', 'confirm']);

const { t } = useI18n();

const dialogRef = ref(null);

const description = computed(() =>
  t('COMPANIES.DETAIL.CONTACTS.DIALOGS.REASSIGN.DESCRIPTION', {
    contactName:
      props.contact?.name || t('COMPANIES.DETAIL.CONTACTS.UNNAMED_CONTACT'),
    fromCompany: props.fromCompany?.name || t('COMPANIES.UNNAMED'),
    toCompany: props.toCompany?.name || t('COMPANIES.UNNAMED'),
  })
);

defineExpose({ dialogRef });
</script>

<template>
  <Dialog
    ref="dialogRef"
    type="alert"
    :title="t('COMPANIES.DETAIL.CONTACTS.DIALOGS.REASSIGN.TITLE')"
    :description="description"
    :confirm-button-label="
      t('COMPANIES.DETAIL.CONTACTS.DIALOGS.REASSIGN.CONFIRM')
    "
    :is-loading="isLoading"
    @close="emit('close')"
    @confirm="emit('confirm')"
  />
</template>
