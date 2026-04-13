<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { debounce } from '@chatwoot/utils';

import Avatar from 'dashboard/components-next/avatar/Avatar.vue';
import Button from 'dashboard/components-next/button/Button.vue';
import Dialog from 'dashboard/components-next/dialog/Dialog.vue';
import InlineInput from 'dashboard/components-next/inline-input/InlineInput.vue';
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

const emit = defineEmits(['close', 'search', 'searchPage', 'selectContact']);

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

const debouncedSearch = debounce(query => {
  emit('search', query);
}, 300);

const updateSearch = value => {
  searchValue.value = value;
  debouncedSearch(value.trim());
};

const resetDialog = () => {
  debouncedSearch.cancel?.();
  searchValue.value = '';
  emit('close');
};

const actionLabel = contact => {
  if (contact.company?.id && contact.company.id !== props.company?.id) {
    return t('COMPANIES.DETAIL.CONTACTS.DIALOGS.ADD.REASSIGN');
  }

  return t('COMPANIES.DETAIL.CONTACTS.DIALOGS.ADD.ADD');
};

const contactMeta = contact => {
  return [contact.email, contact.phoneNumber].filter(Boolean).join(' • ');
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
      <InlineInput
        v-model="searchValue"
        :placeholder="
          t('COMPANIES.DETAIL.CONTACTS.DIALOGS.ADD.SEARCH_PLACEHOLDER')
        "
        custom-input-class="min-h-10 px-3 py-2 border rounded-xl border-n-weak bg-n-surface-1"
        @input="updateSearch"
      />

      <div
        v-if="isSearching && !hasResults"
        class="px-4 py-8 text-sm text-center rounded-xl border border-dashed border-n-weak text-n-slate-11"
      >
        {{ t('COMPANIES.DETAIL.CONTACTS.LOADING') }}
      </div>

      <div
        v-else-if="!hasSearchQuery"
        class="px-4 py-8 text-sm text-center rounded-xl border border-dashed border-n-weak text-n-slate-11"
      >
        {{ t('COMPANIES.DETAIL.CONTACTS.DIALOGS.ADD.INITIAL') }}
      </div>

      <div
        v-else-if="!hasResults"
        class="px-4 py-8 text-sm text-center rounded-xl border border-dashed border-n-weak text-n-slate-11"
      >
        {{ t('COMPANIES.DETAIL.CONTACTS.DIALOGS.ADD.EMPTY') }}
      </div>

      <div v-else class="flex flex-col gap-3">
        <div
          v-for="contact in results"
          :key="contact.id"
          class="flex flex-col gap-3 p-4 rounded-xl border border-n-weak bg-n-alpha-1 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="flex items-center min-w-0 gap-3">
            <Avatar
              :name="contact.name || t('CONTACTS_LAYOUT.FORM.NAME.LABEL')"
              :src="contact.thumbnail"
              :size="40"
              rounded-full
              hide-offline-status
            />
            <div class="min-w-0">
              <p class="text-sm font-medium truncate text-n-slate-12">
                {{ contact.name || t('CONTACTS_LAYOUT.FORM.NAME.LABEL') }}
              </p>
              <p
                v-if="contactMeta(contact)"
                class="text-sm truncate text-n-slate-11"
              >
                {{ contactMeta(contact) }}
              </p>
              <p
                v-if="contact.company?.name"
                class="text-sm truncate text-n-amber-11"
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
            color="blue"
            size="sm"
            :label="actionLabel(contact)"
            :disabled="isSubmitting"
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
