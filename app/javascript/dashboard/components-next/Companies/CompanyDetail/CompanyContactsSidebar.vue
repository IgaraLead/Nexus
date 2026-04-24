<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

import Avatar from 'dashboard/components-next/avatar/Avatar.vue';
import Button from 'dashboard/components-next/button/Button.vue';
import PaginationFooter from 'dashboard/components-next/pagination/PaginationFooter.vue';

const props = defineProps({
  contacts: {
    type: Array,
    default: () => [],
  },
  meta: {
    type: Object,
    default: () => ({}),
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
  isBusy: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  'addContact',
  'createContact',
  'removeContact',
  'update:currentPage',
]);

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const hasContacts = computed(() => props.contacts.length > 0);
const currentPage = computed(() => Number(props.meta?.page || 1));
const totalContacts = computed(() => Number(props.meta?.totalCount || 0));
const showPaginationFooter = computed(
  () => hasContacts.value && totalContacts.value > props.contacts.length
);

const openContact = contactId => {
  router.push({
    name: 'contacts_edit',
    params: {
      accountId: route.params.accountId,
      contactId,
    },
  });
};

const contactMeta = contact => {
  return [contact.email, contact.phoneNumber].filter(Boolean).join(' • ');
};
</script>

<template>
  <div class="flex flex-col">
    <div
      v-if="isLoading && !hasContacts"
      class="px-6 py-10 text-sm text-center text-n-slate-11"
    >
      {{ t('COMPANIES.DETAIL.CONTACTS.LOADING') }}
    </div>

    <div
      v-else-if="!hasContacts"
      class="px-6 py-10 text-sm text-center text-n-slate-11"
    >
      {{ t('COMPANIES.DETAIL.CONTACTS.EMPTY') }}
    </div>

    <div v-else class="flex flex-col">
      <div
        v-for="contact in contacts"
        :key="contact.id"
        class="flex flex-col gap-3 px-6 py-4 border-t border-n-weak first:border-t-0 sm:flex-row sm:items-center sm:justify-between"
      >
        <button
          type="button"
          class="flex items-center flex-1 min-w-0 gap-3 text-left rounded-xl transition-colors text-n-slate-12 hover:bg-n-alpha-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-n-brand focus-visible:ring-offset-2 focus-visible:ring-offset-n-background"
          @click="openContact(contact.id)"
        >
          <Avatar
            :name="
              contact.name || t('COMPANIES.DETAIL.CONTACTS.UNNAMED_CONTACT')
            "
            :src="contact.thumbnail"
            :size="40"
            rounded-full
            hide-offline-status
          />
          <div class="min-w-0">
            <p class="text-sm font-medium truncate text-n-slate-12">
              {{
                contact.name || t('COMPANIES.DETAIL.CONTACTS.UNNAMED_CONTACT')
              }}
            </p>
            <p
              v-if="contactMeta(contact)"
              class="text-sm truncate text-n-slate-11"
            >
              {{ contactMeta(contact) }}
            </p>
          </div>
        </button>

        <Button
          icon="i-lucide-unlink"
          color="slate"
          variant="ghost"
          size="sm"
          :disabled="isBusy"
          :title="t('COMPANIES.DETAIL.CONTACTS.ACTIONS.REMOVE')"
          :aria-label="t('COMPANIES.DETAIL.CONTACTS.ACTIONS.REMOVE')"
          @click.stop="emit('removeContact', contact.id)"
        />
      </div>
    </div>

    <PaginationFooter
      v-if="showPaginationFooter"
      current-page-info="CONTACTS_LAYOUT.PAGINATION_FOOTER.SHOWING"
      :current-page="currentPage"
      :total-items="totalContacts"
      :items-per-page="15"
      class="px-6 before:hidden"
      @update:current-page="emit('update:currentPage', $event)"
    />

    <div class="px-6 py-6 border-t border-n-weak">
      <div class="flex items-center justify-between gap-3">
        <Button
          :label="t('COMPANIES.DETAIL.CONTACTS.ACTIONS.ADD')"
          color="slate"
          variant="faded"
          class="w-full"
          :disabled="isBusy"
          @click="emit('addContact')"
        />
        <Button
          :label="t('COMPANIES.DETAIL.CONTACTS.ACTIONS.CREATE')"
          class="w-full"
          :disabled="isBusy"
          @click="emit('createContact')"
        />
      </div>
    </div>
  </div>
</template>
