<script setup>
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import Button from 'dashboard/components-next/button/Button.vue';
import Dialog from 'dashboard/components-next/dialog/Dialog.vue';
import Input from 'dashboard/components-next/input/Input.vue';
import TextArea from 'dashboard/components-next/textarea/TextArea.vue';

defineProps({
  isLoading: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['create', 'close']);

const { t } = useI18n();

const dialogRef = ref(null);
const state = reactive({
  name: '',
  domain: '',
  description: '',
});

const isFormInvalid = computed(() => !state.name.trim());

const resetForm = () => {
  state.name = '';
  state.domain = '';
  state.description = '';
};

const closeDialog = () => {
  dialogRef.value?.close();
};

const handleDialogClose = () => {
  resetForm();
  emit('close');
};

const handleDialogConfirm = () => {
  if (isFormInvalid.value) {
    return;
  }

  emit('create', {
    name: state.name.trim(),
    domain: state.domain.trim(),
    description: state.description.trim(),
  });
};

const onSuccess = () => {
  resetForm();
  dialogRef.value?.close();
};

defineExpose({ dialogRef, onSuccess });
</script>

<template>
  <Dialog
    ref="dialogRef"
    width="xl"
    :title="t('COMPANIES.CREATE.TITLE')"
    :description="t('COMPANIES.CREATE.DESCRIPTION')"
    @close="handleDialogClose"
    @confirm="handleDialogConfirm"
  >
    <div class="flex flex-col gap-4">
      <Input
        v-model="state.name"
        :label="t('COMPANIES.CREATE.FIELDS.NAME')"
        :placeholder="t('COMPANIES.CREATE.PLACEHOLDERS.NAME')"
        autofocus
      />
      <Input
        v-model="state.domain"
        :label="t('COMPANIES.CREATE.FIELDS.DOMAIN')"
        :placeholder="t('COMPANIES.CREATE.PLACEHOLDERS.DOMAIN')"
      />
      <TextArea
        v-model="state.description"
        :label="t('COMPANIES.CREATE.FIELDS.DESCRIPTION')"
        :placeholder="t('COMPANIES.CREATE.PLACEHOLDERS.DESCRIPTION')"
        :max-length="280"
        show-character-count
        auto-height
      />
    </div>
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
          :label="t('COMPANIES.CREATE.BUTTON')"
          color="blue"
          :disabled="isFormInvalid"
          :is-loading="isLoading"
        />
      </div>
    </template>
  </Dialog>
</template>
