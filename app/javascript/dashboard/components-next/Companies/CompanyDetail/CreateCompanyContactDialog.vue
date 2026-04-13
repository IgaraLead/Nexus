<script setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

import Button from 'dashboard/components-next/button/Button.vue';
import Dialog from 'dashboard/components-next/dialog/Dialog.vue';
import ContactsForm from 'dashboard/components-next/Contacts/ContactsForm/ContactsForm.vue';

defineProps({
  isLoading: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['close', 'create']);

const { t } = useI18n();

const dialogRef = ref(null);
const contactsFormRef = ref(null);

const closeDialog = () => {
  dialogRef.value?.close();
};

const handleDialogClose = () => {
  contactsFormRef.value?.resetForm();
  emit('close');
};

const handleDialogConfirm = async () => {
  const contactState = contactsFormRef.value?.state;

  if (!contactState) {
    return;
  }

  const { firstName, lastName, ...contactAttrs } = contactState;

  emit('create', {
    ...contactAttrs,
    additionalAttributes: {
      ...(contactAttrs.additionalAttributes || {}),
      socialProfiles: {
        ...(contactAttrs.additionalAttributes?.socialProfiles || {}),
      },
    },
  });
};

const onSuccess = () => {
  contactsFormRef.value?.resetForm();
  dialogRef.value?.close();
};

defineExpose({ dialogRef, contactsFormRef, onSuccess });
</script>

<template>
  <Dialog
    ref="dialogRef"
    width="3xl"
    :title="t('COMPANIES.DETAIL.CONTACTS.DIALOGS.CREATE.TITLE')"
    @close="handleDialogClose"
    @confirm="handleDialogConfirm"
  >
    <template #default>
      <ContactsForm ref="contactsFormRef" is-new-contact />
    </template>
    <template #footer>
      <div class="flex items-center justify-between w-full gap-3">
        <Button
          type="button"
          :label="t('DIALOG.BUTTONS.CANCEL')"
          variant="link"
          color="slate"
          class="h-10 hover:!no-underline"
          @click="closeDialog"
        />
        <Button
          type="submit"
          :label="t('COMPANIES.DETAIL.CONTACTS.DIALOGS.CREATE.SAVE')"
          color="blue"
          :disabled="contactsFormRef?.isFormInvalid"
          :is-loading="isLoading"
        />
      </div>
    </template>
  </Dialog>
</template>
