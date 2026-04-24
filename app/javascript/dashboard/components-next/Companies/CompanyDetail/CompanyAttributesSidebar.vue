<script setup>
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col">
    <div class="px-6 py-10 text-sm text-center text-n-slate-11">
      {{ t('COMPANIES.DETAIL.ATTRIBUTES.PLACEHOLDER') }}
    </div>
  </div>
</template>
