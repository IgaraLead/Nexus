<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useAlert } from 'dashboard/composables';

import Policy from 'dashboard/components/policy.vue';
import Button from 'dashboard/components-next/button/Button.vue';
import DetailsLayout from 'dashboard/components-next/DetailsLayout.vue';
import Spinner from 'dashboard/components-next/spinner/Spinner.vue';
import TabBar from 'dashboard/components-next/tabbar/TabBar.vue';
import CompanyProfileCard from 'dashboard/components-next/Companies/CompanyDetail/CompanyProfileCard.vue';
import CompanyContactsSidebar from 'dashboard/components-next/Companies/CompanyDetail/CompanyContactsSidebar.vue';
import CompanyHistorySidebar from 'dashboard/components-next/Companies/CompanyDetail/CompanyHistorySidebar.vue';
import CompanyNotesSidebar from 'dashboard/components-next/Companies/CompanyDetail/CompanyNotesSidebar.vue';
import ConfirmCompanyDeleteDialog from 'dashboard/components-next/Companies/CompanyDetail/ConfirmCompanyDeleteDialog.vue';
import { useCompaniesStore } from 'dashboard/stores/companies';

const route = useRoute();
const router = useRouter();
const companiesStore = useCompaniesStore();
const { t } = useI18n();

const confirmDeleteDialogRef = ref(null);
const selectedCandidate = ref(null);
const activeSidebarTab = ref('notes');

const companyId = computed(() => Number(route.params.companyId));
const company = computed(() => companiesStore.getRecord(companyId.value));
const companyContacts = computed(() => companiesStore.companyContacts);
const companyContactsMeta = computed(() => companiesStore.companyContactsMeta);
const contactSearchResults = computed(
  () => companiesStore.contactSearchResults
);
const uiFlags = computed(() => companiesStore.getUIFlags);

const isFetchingCompany = computed(() => uiFlags.value.fetchingItem);
const isFetchingContacts = computed(() => uiFlags.value.fetchingContacts);
const isSearchingContacts = computed(() => uiFlags.value.searchingContacts);
const isManagingContacts = computed(
  () => uiFlags.value.linkingContact || uiFlags.value.removingContact
);
const isDeletingCompany = computed(() => uiFlags.value.deletingItem);
const hasCompany = computed(() => Boolean(company.value?.id));
const showInitialLoadingState = computed(
  () =>
    !hasCompany.value && (isFetchingCompany.value || isFetchingContacts.value)
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

const sidebarTabs = computed(() => [
  {
    label: t('COMPANIES.DETAIL.SIDEBAR.TABS.NOTES'),
    value: 'notes',
  },
  {
    label: t('COMPANIES.DETAIL.SIDEBAR.TABS.HISTORY'),
    value: 'history',
  },
  {
    label: t('COMPANIES.DETAIL.SIDEBAR.TABS.CONTACTS'),
    value: 'contacts',
    count: Number(company.value?.contactsCount || 0),
  },
]);

const activeSidebarTabIndex = computed(() => {
  return sidebarTabs.value.findIndex(
    tab => tab.value === activeSidebarTab.value
  );
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

  await Promise.allSettled([
    companiesStore.show(activeCompanyId),
    companiesStore.getCompanyContacts(activeCompanyId),
  ]);
};

const loadCompanyContactsPage = async page => {
  if (!companyId.value) {
    return;
  }

  await Promise.allSettled([
    companiesStore.getCompanyContacts(companyId.value, page),
  ]);
};

const goToCompaniesList = () => {
  if (window.history.state?.back || window.history.length > 1) {
    router.back();
    return;
  }

  goToCompaniesIndex();
};

const refreshDetail = async page => {
  if (!companyId.value) {
    return;
  }

  await Promise.allSettled([
    companiesStore.show(companyId.value),
    companiesStore.getCompanyContacts(
      companyId.value,
      page || companiesStore.companyContactsMeta.page || 1
    ),
  ]);
};

const openDeleteCompanyDialog = () => {
  confirmDeleteDialogRef.value?.dialogRef.open();
};

const handleContactSearch = async query => {
  await companiesStore.searchCompanyContactCandidates(companyId.value, query);
};

const clearSelectedCandidate = () => {
  selectedCandidate.value = null;
};

const attachSelectedContact = async ({
  contactId,
  successMessage,
  errorMessage,
}) => {
  try {
    await companiesStore.attachContactToCompany(companyId.value, contactId);
    useAlert(successMessage);
    await refreshDetail();
    await companiesStore.searchCompanyContactCandidates(companyId.value, '');
    clearSelectedCandidate();
  } catch {
    useAlert(errorMessage);
  }
};

const handleSelectContact = contact => {
  selectedCandidate.value = contact;
};

const handleConfirmContactSelection = async () => {
  if (!selectedCandidate.value) {
    return;
  }

  const isReassigning =
    selectedCandidate.value.company?.id &&
    selectedCandidate.value.company.id !== companyId.value;

  await attachSelectedContact({
    contactId: selectedCandidate.value.id,
    successMessage: isReassigning
      ? t('COMPANIES.DETAIL.CONTACTS.MESSAGES.REASSIGN_SUCCESS')
      : t('COMPANIES.DETAIL.CONTACTS.MESSAGES.ADD_SUCCESS'),
    errorMessage: isReassigning
      ? t('COMPANIES.DETAIL.CONTACTS.MESSAGES.REASSIGN_ERROR')
      : t('COMPANIES.DETAIL.CONTACTS.MESSAGES.ADD_ERROR'),
  });
};

const handleRemoveContact = async contactId => {
  const currentPage = Number(companiesStore.companyContactsMeta.page || 1);
  const nextPage =
    currentPage > 1 && companyContacts.value.length === 1
      ? currentPage - 1
      : currentPage;

  try {
    await companiesStore.removeContactFromCompany(companyId.value, contactId);
    useAlert(t('COMPANIES.DETAIL.CONTACTS.MESSAGES.REMOVE_SUCCESS'));
    await refreshDetail(nextPage);
  } catch {
    useAlert(t('COMPANIES.DETAIL.CONTACTS.MESSAGES.REMOVE_ERROR'));
  }
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

const handleSidebarTabChange = tab => {
  activeSidebarTab.value = tab.value;
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

    <template v-if="hasCompany" #sidebar>
      <div class="flex flex-col gap-4">
        <div class="px-6">
          <TabBar
            :tabs="sidebarTabs"
            :initial-active-tab="activeSidebarTabIndex"
            class="w-full [&>button]:w-full bg-n-alpha-black2"
            @tab-changed="handleSidebarTabChange"
          />
        </div>

        <CompanyContactsSidebar
          v-if="activeSidebarTab === 'contacts'"
          :company="company"
          :contacts="companyContacts"
          :meta="companyContactsMeta"
          :is-loading="isFetchingContacts"
          :is-busy="isManagingContacts"
          :search-results="contactSearchResults"
          :is-searching="isSearchingContacts"
          :selected-contact="selectedCandidate"
          @cancel-contact-selection="clearSelectedCandidate"
          @confirm-contact-selection="handleConfirmContactSelection"
          @search="handleContactSearch"
          @select-contact="handleSelectContact"
          @remove-contact="handleRemoveContact"
          @update:current-page="loadCompanyContactsPage"
        />

        <CompanyNotesSidebar
          v-else-if="activeSidebarTab === 'notes'"
          :company-id="companyId"
          :contacts="companyContacts"
          :meta="companyContactsMeta"
        />

        <CompanyHistorySidebar
          v-else-if="activeSidebarTab === 'history'"
          :company-id="companyId"
          :contacts="companyContacts"
          :meta="companyContactsMeta"
          :is-loading="isFetchingContacts"
        />
      </div>
    </template>

    <ConfirmCompanyDeleteDialog
      ref="confirmDeleteDialogRef"
      :company="company"
      :is-loading="isDeletingCompany"
      @confirm="handleDeleteCompany"
    />
  </DetailsLayout>
</template>
