<script setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

import Button from 'dashboard/components-next/button/Button.vue';
import DropdownMenu from 'dashboard/components-next/dropdown-menu/DropdownMenu.vue';

const emit = defineEmits(['add']);

const { t } = useI18n();

const companyMenuItems = [
  {
    label: t('COMPANIES.CREATE.BUTTON'),
    action: 'add',
    value: 'add',
    icon: 'i-lucide-plus',
  },
];

const showActionsDropdown = ref(false);

const handleCompanyAction = ({ action }) => {
  if (action === 'add') {
    emit('add');
  }
};
</script>

<template>
  <div v-on-clickaway="() => (showActionsDropdown = false)" class="relative">
    <Button
      icon="i-lucide-ellipsis-vertical"
      color="slate"
      variant="ghost"
      size="sm"
      :class="showActionsDropdown ? 'bg-n-alpha-2' : ''"
      @click="showActionsDropdown = !showActionsDropdown"
    />
    <DropdownMenu
      v-if="showActionsDropdown"
      :menu-items="companyMenuItems"
      class="ltr:right-0 rtl:left-0 mt-1 w-52 top-full"
      @action="handleCompanyAction($event)"
    />
  </div>
</template>
