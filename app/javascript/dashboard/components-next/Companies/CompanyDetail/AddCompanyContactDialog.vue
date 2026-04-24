<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { debounce } from '@chatwoot/utils';

import Avatar from 'dashboard/components-next/avatar/Avatar.vue';
import Button from 'dashboard/components-next/button/Button.vue';
import Dialog from 'dashboard/components-next/dialog/Dialog.vue';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import Input from 'dashboard/components-next/input/Input.vue';
import PaginationFooter from 'dashboard/components-next/pagination/PaginationFooter.vue';

const props = defineProps({
  company: {
    type: Object,
    default: () => ({}),
  },
  results: {
    type: Array,
    default: () => [],
  },
  meta: {
    type: Object,
    default: () => ({}),
  },
  isSearching: {
    type: Boolean,
    default: false,
  },
  isSubmitting: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  'close',
  'createContact',
  'search',
  'searchPage',
  'selectContact',
]);

const { t } = useI18n();

const dialogRef = ref(null);
const searchValue = ref('');

const currentPage = computed(() => Number(props.meta?.page || 1));
const totalResults = computed(() => Number(props.meta?.totalCount || 0));
const hasResults = computed(() => props.results.length > 0);
const hasSearchQuery = computed(() => Boolean(searchValue.value.trim()));
const showPaginationFooter = computed(
  () => hasResults.value && totalResults.value > props.results.length
);
const resultsSummary = computed(() =>
  t('COMPANIES.DETAIL.CONTACTS.DIALOGS.ADD.RESULTS', {
    n: totalResults.value,
  })
);

const debouncedSearch = debounce(query => {
  emit('search', query);
}, 300);

const updateSearch = event => {
  const value = event?.target?.value || '';
  searchValue.value = value;
  debouncedSearch(value.trim());
};

const resetDialog = () => {
  debouncedSearch.cancel?.();
  searchValue.value = '';
  emit('close');
};

const contactName = contact =>
  contact.name || t('COMPANIES.DETAIL.CONTACTS.UNNAMED_CONTACT');

const isAlreadyLinked = contact =>
  Boolean(
    contact.linkedToCurrentCompany ||
      (contact.company?.id && contact.company.id === props.company?.id)
  );

const hasDifferentCompany = contact =>
  Boolean(contact.company?.id && contact.company.id !== props.company?.id);

const actionConfig = contact => {
  if (isAlreadyLinked(contact)) {
    return {
      color: 'slate',
      disabled: true,
      label: t('COMPANIES.DETAIL.CONTACTS.DIALOGS.ADD.LINKED'),
      variant: 'faded',
    };
  }

  if (hasDifferentCompany(contact)) {
    return {
      color: 'amber',
      disabled: props.isSubmitting,
      label: t('COMPANIES.DETAIL.CONTACTS.DIALOGS.ADD.REASSIGN'),
      variant: 'outline',
    };
  }

  return {
    color: 'blue',
    disabled: props.isSubmitting,
    label: t('COMPANIES.DETAIL.CONTACTS.DIALOGS.ADD.ADD'),
    variant: 'solid',
  };
};

const statusConfig = contact => {
  if (isAlreadyLinked(contact)) {
    return {
      className: 'bg-n-teal-9/10 text-n-teal-11',
      label: t('COMPANIES.DETAIL.CONTACTS.DIALOGS.ADD.STATUSES.LINKED'),
    };
  }

  if (hasDifferentCompany(contact)) {
    return {
      className: 'bg-n-amber-9/10 text-n-amber-11',
      label: t('COMPANIES.DETAIL.CONTACTS.DIALOGS.ADD.STATUSES.ASSIGNED'),
    };
  }

  return {
    className: 'bg-n-alpha-2 text-n-slate-11',
    label: t('COMPANIES.DETAIL.CONTACTS.DIALOGS.ADD.STATUSES.AVAILABLE'),
  };
};

const contactMeta = contact => {
  return [contact.email, contact.phoneNumber, contact.identifier]
    .filter(Boolean)
    .join(' • ');
};

defineExpose({ dialogRef });
</script>

<template>
  <Dialog
    ref="dialogRef"
    width="2xl"
    :title="t('COMPANIES.DETAIL.CONTACTS.DIALOGS.ADD.TITLE')"
    :description="t('COMPANIES.DETAIL.CONTACTS.DIALOGS.ADD.DESCRIPTION')"
    :show-confirm-button="false"
    @close="resetDialog"
  >
    <div class="flex flex-col gap-4">
      <Input
        :model-value="searchValue"
        type="search"
        :placeholder="
          t('COMPANIES.DETAIL.CONTACTS.DIALOGS.ADD.SEARCH_PLACEHOLDER')
        "
        autofocus
        custom-input-class="bg-n-surface-1 ltr:!pl-9 rtl:!pr-9"
        @input="updateSearch"
      >
        <template #prefix>
          <Icon
            icon="i-lucide-search"
            class="absolute -translate-y-1/2 text-n-slate-11 size-4 top-1/2 ltr:left-3 rtl:right-3"
          />
        </template>
      </Input>

      <div
        v-if="isSearching && !hasResults"
        class="flex items-center gap-2 px-4 py-3 rounded-xl bg-n-alpha-2 text-sm text-n-slate-11"
      >
        <Icon icon="i-lucide-loader-circle" class="size-4 animate-spin" />
        <span>{{ t('COMPANIES.DETAIL.CONTACTS.LOADING') }}</span>
      </div>

      <div
        v-else-if="hasSearchQuery && hasResults"
        class="flex flex-col gap-1 px-4 py-3 rounded-xl bg-n-alpha-2"
      >
        <span class="text-sm font-medium text-n-slate-12">
          {{ resultsSummary }}
        </span>
        <p class="text-sm text-n-slate-11">
          {{ t('COMPANIES.DETAIL.CONTACTS.DIALOGS.ADD.INFO') }}
        </p>
      </div>

      <div
        v-else-if="!hasSearchQuery"
        class="flex flex-col items-center gap-3 px-4 py-8 text-sm text-center rounded-xl border border-dashed border-n-weak text-n-slate-11"
      >
        <p class="max-w-sm">
          {{ t('COMPANIES.DETAIL.CONTACTS.DIALOGS.ADD.INITIAL') }}
        </p>
        <Button
          type="button"
          color="slate"
          variant="faded"
          size="sm"
          :label="t('COMPANIES.DETAIL.CONTACTS.ACTIONS.CREATE')"
          :disabled="isSubmitting"
          @click="emit('createContact')"
        />
      </div>

      <div
        v-else-if="!hasResults"
        class="flex flex-col items-center gap-3 px-4 py-8 text-sm text-center rounded-xl border border-dashed border-n-weak text-n-slate-11"
      >
        <p class="max-w-sm">
          {{ t('COMPANIES.DETAIL.CONTACTS.DIALOGS.ADD.EMPTY') }}
        </p>
        <Button
          type="button"
          color="slate"
          variant="faded"
          size="sm"
          :label="t('COMPANIES.DETAIL.CONTACTS.ACTIONS.CREATE')"
          :disabled="isSubmitting"
          @click="emit('createContact')"
        />
      </div>

      <div v-else class="overflow-hidden border rounded-xl border-n-weak">
        <div
          v-for="contact in results"
          :key="contact.id"
          class="flex flex-col gap-3 px-4 py-4 bg-n-surface-1 border-b border-n-weak last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="flex items-start min-w-0 gap-3">
            <Avatar
              :name="contactName(contact)"
              :src="contact.thumbnail"
              :size="40"
              rounded-full
              hide-offline-status
            />
            <div class="flex flex-col min-w-0 gap-1">
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-sm font-medium truncate text-n-slate-12">
                  {{ contactName(contact) }}
                </p>
                <span
                  class="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full"
                  :class="statusConfig(contact).className"
                >
                  {{ statusConfig(contact).label }}
                </span>
              </div>
              <p
                v-if="contactMeta(contact)"
                class="text-sm truncate text-n-slate-11"
              >
                {{ contactMeta(contact) }}
              </p>
              <p
                v-if="isAlreadyLinked(contact)"
                class="text-sm truncate text-n-slate-11"
              >
                {{ t('COMPANIES.DETAIL.CONTACTS.DIALOGS.ADD.ALREADY_LINKED') }}
              </p>
              <p
                v-else-if="contact.company?.name"
                class="text-sm truncate text-n-slate-11"
              >
                {{
                  t('COMPANIES.DETAIL.CONTACTS.DIALOGS.ADD.CURRENT_COMPANY', {
                    companyName: contact.company.name,
                  })
                }}
              </p>
            </div>
          </div>

          <Button
            type="button"
            :color="actionConfig(contact).color"
            :variant="actionConfig(contact).variant"
            size="sm"
            :label="actionConfig(contact).label"
            :disabled="actionConfig(contact).disabled"
            @click="emit('selectContact', contact)"
          />
        </div>
      </div>

      <PaginationFooter
        v-if="showPaginationFooter"
        current-page-info="COMPANIES_LAYOUT.PAGINATION_FOOTER.SHOWING"
        :current-page="currentPage"
        :total-items="totalResults"
        :items-per-page="15"
        class="px-0 border-t-0 before:hidden"
        @update:current-page="
          emit('searchPage', { page: $event, query: searchValue.trim() })
        "
      />
    </div>
  </Dialog>
</template>
