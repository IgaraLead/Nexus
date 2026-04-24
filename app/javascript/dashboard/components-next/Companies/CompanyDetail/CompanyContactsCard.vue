<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

import Avatar from 'dashboard/components-next/avatar/Avatar.vue';
import Button from 'dashboard/components-next/button/Button.vue';
import CardLayout from 'dashboard/components-next/CardLayout.vue';
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

const emit = defineEmits(['removeContact', 'update:currentPage']);

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
  <CardLayout>
    <div class="flex flex-col gap-2">
      <div class="flex items-start justify-between gap-3">
        <div class="flex flex-col gap-1">
          <h2 class="text-lg font-medium text-n-slate-12">
            {{ t('COMPANIES.DETAIL.CONTACTS.TITLE') }}
          </h2>
          <p class="text-sm text-n-slate-11">
            {{ t('COMPANIES.DETAIL.CONTACTS.SUBTITLE') }}
          </p>
        </div>
        <span
          class="inline-flex items-center justify-center min-w-8 h-8 px-2 text-sm font-medium rounded-full bg-n-alpha-2 text-n-slate-12"
        >
          {{ totalContacts }}
        </span>
      </div>
    </div>

    <template #after>
      <div
        v-if="isLoading && !hasContacts"
        class="px-6 py-8 text-sm text-center text-n-slate-11"
      >
        {{ t('COMPANIES.DETAIL.CONTACTS.LOADING') }}
      </div>

      <div
        v-else-if="!hasContacts"
        class="px-6 py-8 text-sm text-center text-n-slate-11"
      >
        {{ t('COMPANIES.DETAIL.CONTACTS.EMPTY') }}
      </div>

      <div v-else class="flex flex-col">
        <div
          v-for="contact in contacts"
          :key="contact.id"
          class="flex flex-col gap-3 px-6 py-4 border-t border-n-weak sm:flex-row sm:items-center sm:justify-between"
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
            </div>
          </div>

          <div class="flex items-center gap-2">
            <Button
              variant="link"
              color="slate"
              size="sm"
              :label="t('COMPANIES.DETAIL.CONTACTS.VIEW_CONTACT')"
              @click="openContact(contact.id)"
            />
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
      </div>

      <PaginationFooter
        v-if="showPaginationFooter"
        current-page-info="CONTACTS_LAYOUT.PAGINATION_FOOTER.SHOWING"
        :current-page="currentPage"
        :total-items="totalContacts"
        :items-per-page="15"
        class="px-6 border-t-0 before:hidden"
        @update:current-page="emit('update:currentPage', $event)"
      />
    </template>
  </CardLayout>
</template>
