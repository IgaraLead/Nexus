<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useAlert } from 'dashboard/composables';

import Policy from 'dashboard/components/policy.vue';
import Button from 'dashboard/components-next/button/Button.vue';
import DetailsLayout from 'dashboard/components-next/DetailsLayout.vue';
import Spinner from 'dashboard/components-next/spinner/Spinner.vue';
import CompanyProfileCard from 'dashboard/components-next/Companies/CompanyDetail/CompanyProfileCard.vue';
import ConfirmCompanyDeleteDialog from 'dashboard/components-next/Companies/CompanyDetail/ConfirmCompanyDeleteDialog.vue';
import { useCompaniesStore } from 'dashboard/stores/companies';

const route = useRoute();
const router = useRouter();
const companiesStore = useCompaniesStore();
const { t } = useI18n();

const confirmDeleteDialogRef = ref(null);

const companyId = computed(() => Number(route.params.companyId));
const company = computed(() => companiesStore.getRecord(companyId.value));
const uiFlags = computed(() => companiesStore.getUIFlags);

const isFetchingCompany = computed(() => uiFlags.value.fetchingItem);
const isDeletingCompany = computed(() => uiFlags.value.deletingItem);
const hasCompany = computed(() => Boolean(company.value?.id));
const showInitialLoadingState = computed(
  () => !hasCompany.value && isFetchingCompany.value
);
const breadcrumbItems = computed(() => {
  const items = [
    {
      label: t('COMPANIES.HEADER'),
    },
  ];

  if (hasCompany.value) {
    items.push({
      label: company.value?.name || t('COMPANIES.UNNAMED'),
    });
  }

  return items;
});

const goToCompaniesIndex = () => {
  router.push({
    name: 'companies_dashboard_index',
    params: { accountId: route.params.accountId },
    query: { page: '1' },
  });
};

const fetchCompanyDetail = async activeCompanyId => {
  if (!activeCompanyId) {
    return;
  }

  await companiesStore.show(activeCompanyId);
};

const goToCompaniesList = () => {
  if (window.history.state?.back || window.history.length > 1) {
    router.back();
    return;
  }

  goToCompaniesIndex();
};

const openDeleteCompanyDialog = () => {
  confirmDeleteDialogRef.value?.dialogRef.open();
};

const handleDeleteCompany = async () => {
  try {
    await companiesStore.delete(companyId.value);
    useAlert(t('COMPANIES.DETAIL.DELETE.MESSAGES.SUCCESS'));
    confirmDeleteDialogRef.value?.dialogRef.close();
    goToCompaniesIndex();
  } catch {
    useAlert(t('COMPANIES.DETAIL.DELETE.MESSAGES.ERROR'));
  }
};

watch(
  companyId,
  async currentCompanyId => {
    companiesStore.resetCompanyDetailState();
    await fetchCompanyDetail(currentCompanyId);
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  companiesStore.resetCompanyDetailState();
});
</script>

<template>
  <DetailsLayout :breadcrumb-items="breadcrumbItems" @back="goToCompaniesList">
    <div
      v-if="showInitialLoadingState"
      class="flex flex-col items-center justify-center gap-3 py-24 text-n-slate-11"
    >
      <Spinner />
      <span class="text-sm">
        {{ t('COMPANIES.DETAIL.LOADING') }}
      </span>
    </div>

    <div
      v-else-if="!hasCompany"
      class="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center rounded-2xl border border-n-weak bg-n-solid-2"
    >
      <span class="text-lg font-medium text-n-slate-12">
        {{ t('COMPANIES.DETAIL.EMPTY_STATE.TITLE') }}
      </span>
      <p class="max-w-md text-sm text-n-slate-11">
        {{ t('COMPANIES.DETAIL.EMPTY_STATE.SUBTITLE') }}
      </p>
    </div>

    <div v-else class="flex flex-col gap-6">
      <CompanyProfileCard :company="company" :is-loading="isFetchingCompany" />

      <Policy :permissions="['administrator']">
        <section
          class="flex flex-col items-start w-full gap-4 pt-6 border-t border-n-strong"
        >
          <div class="flex flex-col gap-2">
            <h6 class="text-base font-medium text-n-slate-12">
              {{ t('COMPANIES.DETAIL.DELETE.SECTION_TITLE') }}
            </h6>
            <span class="text-sm text-n-slate-11">
              {{ t('COMPANIES.DETAIL.DELETE.SECTION_DESCRIPTION') }}
            </span>
          </div>
          <Button
            :label="t('COMPANIES.DETAIL.DELETE.BUTTON')"
            color="ruby"
            :disabled="isDeletingCompany"
            @click="openDeleteCompanyDialog"
          />
        </section>
      </Policy>
    </div>

    <ConfirmCompanyDeleteDialog
      ref="confirmDeleteDialogRef"
      :company="company"
      :is-loading="isDeletingCompany"
      @confirm="handleDeleteCompany"
    />
  </DetailsLayout>
</template>
