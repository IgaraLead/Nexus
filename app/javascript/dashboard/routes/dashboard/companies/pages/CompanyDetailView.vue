<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useAlert } from 'dashboard/composables';

import Policy from 'dashboard/components/policy.vue';
import Button from 'dashboard/components-next/button/Button.vue';
import Spinner from 'dashboard/components-next/spinner/Spinner.vue';
import CompanyDetailHeader from 'dashboard/components-next/Companies/CompanyDetail/CompanyDetailHeader.vue';
import CompanyProfileCard from 'dashboard/components-next/Companies/CompanyDetail/CompanyProfileCard.vue';
import CompanyContactsCard from 'dashboard/components-next/Companies/CompanyDetail/CompanyContactsCard.vue';
import AddCompanyContactDialog from 'dashboard/components-next/Companies/CompanyDetail/AddCompanyContactDialog.vue';
import CreateCompanyContactDialog from 'dashboard/components-next/Companies/CompanyDetail/CreateCompanyContactDialog.vue';
import ConfirmCompanyContactReassignDialog from 'dashboard/components-next/Companies/CompanyDetail/ConfirmCompanyContactReassignDialog.vue';
import ConfirmCompanyDeleteDialog from 'dashboard/components-next/Companies/CompanyDetail/ConfirmCompanyDeleteDialog.vue';
import { useCompaniesStore } from 'dashboard/stores/companies';

const route = useRoute();
const router = useRouter();
const companiesStore = useCompaniesStore();
const { t } = useI18n();

const addCompanyContactDialogRef = ref(null);
const createCompanyContactDialogRef = ref(null);
const confirmReassignDialogRef = ref(null);
const confirmDeleteDialogRef = ref(null);
const selectedCandidate = ref(null);
const contactSearchQuery = ref('');

const companyId = computed(() => Number(route.params.companyId));
const company = computed(() => companiesStore.getRecord(companyId.value));
const companyContacts = computed(() => companiesStore.companyContacts);
const companyContactsMeta = computed(() => companiesStore.companyContactsMeta);
const contactSearchResults = computed(
  () => companiesStore.contactSearchResults
);
const contactSearchMeta = computed(() => companiesStore.contactSearchMeta);
const uiFlags = computed(() => companiesStore.getUIFlags);

const isFetchingCompany = computed(() => uiFlags.value.fetchingItem);
const isFetchingContacts = computed(() => uiFlags.value.fetchingContacts);
const isSearchingContacts = computed(() => uiFlags.value.searchingContacts);
const isManagingContacts = computed(
  () => uiFlags.value.creatingContact || uiFlags.value.removingContact
);
const isDeletingCompany = computed(() => uiFlags.value.deletingItem);
const hasCompany = computed(() => Boolean(company.value?.id));
const showInitialLoadingState = computed(
  () =>
    !hasCompany.value && (isFetchingCompany.value || isFetchingContacts.value)
);

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

const resetContactSearch = async () => {
  contactSearchQuery.value = '';

  if (!companyId.value) {
    return;
  }

  await companiesStore.searchCompanyContactCandidates(companyId.value, '');
};

const openAddContactDialog = () => {
  addCompanyContactDialogRef.value?.dialogRef.open();
};

const openCreateContactDialog = () => {
  createCompanyContactDialogRef.value?.dialogRef.open();
};

const openDeleteCompanyDialog = () => {
  confirmDeleteDialogRef.value?.dialogRef.open();
};

const handleContactSearch = async query => {
  contactSearchQuery.value = query;
  await companiesStore.searchCompanyContactCandidates(companyId.value, query);
};

const handleContactSearchPage = async ({ page, query }) => {
  contactSearchQuery.value = query;
  await companiesStore.searchCompanyContactCandidates(
    companyId.value,
    query,
    page
  );
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
    addCompanyContactDialogRef.value?.dialogRef.close();
    clearSelectedCandidate();
    confirmReassignDialogRef.value?.dialogRef.close();
  } catch {
    useAlert(errorMessage);
  }
};

const handleSelectContact = async contact => {
  if (contact.company?.id && contact.company.id !== companyId.value) {
    selectedCandidate.value = contact;
    confirmReassignDialogRef.value?.dialogRef.open();
    return;
  }

  await attachSelectedContact({
    contactId: contact.id,
    successMessage: t('COMPANIES.DETAIL.CONTACTS.MESSAGES.ADD_SUCCESS'),
    errorMessage: t('COMPANIES.DETAIL.CONTACTS.MESSAGES.ADD_ERROR'),
  });
};

const handleConfirmReassign = async () => {
  if (!selectedCandidate.value) {
    return;
  }

  await attachSelectedContact({
    contactId: selectedCandidate.value.id,
    successMessage: t('COMPANIES.DETAIL.CONTACTS.MESSAGES.REASSIGN_SUCCESS'),
    errorMessage: t('COMPANIES.DETAIL.CONTACTS.MESSAGES.REASSIGN_ERROR'),
  });
};

const handleCreateContact = async attrs => {
  try {
    await companiesStore.createContactInCompany(companyId.value, attrs);
    useAlert(t('COMPANIES.DETAIL.CONTACTS.MESSAGES.CREATE_SUCCESS'));
    createCompanyContactDialogRef.value?.onSuccess();
    await refreshDetail();
  } catch {
    useAlert(t('COMPANIES.DETAIL.CONTACTS.MESSAGES.CREATE_ERROR'));
  }
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
  <section class="flex flex-col flex-1 h-full overflow-hidden bg-n-surface-1">
    <CompanyDetailHeader :company="company" @back="goToCompaniesList" />
    <main class="flex-1 px-6 overflow-y-auto">
      <div class="w-full max-w-6xl py-6 mx-auto">
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

        <div
          v-else
          class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]"
        >
          <CompanyProfileCard
            :company="company"
            :is-loading="isFetchingCompany"
          />
          <CompanyContactsCard
            :contacts="companyContacts"
            :meta="companyContactsMeta"
            :is-loading="isFetchingContacts"
            :is-busy="isManagingContacts"
            @open-add-contact="openAddContactDialog"
            @open-create-contact="openCreateContactDialog"
            @remove-contact="handleRemoveContact"
            @update:current-page="loadCompanyContactsPage"
          />
        </div>

        <Policy :permissions="['administrator']">
          <section
            v-if="hasCompany"
            class="p-6 mt-6 rounded-2xl border border-n-ruby-8/40 bg-n-ruby-3/40"
          >
            <div
              class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div class="flex flex-col gap-1">
                <h2 class="text-lg font-medium text-n-slate-12">
                  {{ t('COMPANIES.DETAIL.DELETE.SECTION_TITLE') }}
                </h2>
                <p class="text-sm text-n-slate-11">
                  {{ t('COMPANIES.DETAIL.DELETE.SECTION_DESCRIPTION') }}
                </p>
              </div>
              <Button
                :label="t('COMPANIES.DETAIL.DELETE.BUTTON')"
                color="ruby"
                :disabled="isDeletingCompany"
                @click="openDeleteCompanyDialog"
              />
            </div>
          </section>
        </Policy>
      </div>
    </main>

    <AddCompanyContactDialog
      ref="addCompanyContactDialogRef"
      :company="company"
      :results="contactSearchResults"
      :meta="contactSearchMeta"
      :is-searching="isSearchingContacts"
      :is-submitting="isManagingContacts"
      @close="resetContactSearch"
      @search="handleContactSearch"
      @search-page="handleContactSearchPage"
      @select-contact="handleSelectContact"
    />
    <CreateCompanyContactDialog
      ref="createCompanyContactDialogRef"
      :is-loading="isManagingContacts"
      @create="handleCreateContact"
    />
    <ConfirmCompanyContactReassignDialog
      ref="confirmReassignDialogRef"
      :contact="selectedCandidate"
      :from-company="selectedCandidate?.company"
      :to-company="company"
      :is-loading="isManagingContacts"
      @close="clearSelectedCandidate"
      @confirm="handleConfirmReassign"
    />
    <ConfirmCompanyDeleteDialog
      ref="confirmDeleteDialogRef"
      :company="company"
      :is-loading="isDeletingCompany"
      @confirm="handleDeleteCompany"
    />
  </section>
</template>
