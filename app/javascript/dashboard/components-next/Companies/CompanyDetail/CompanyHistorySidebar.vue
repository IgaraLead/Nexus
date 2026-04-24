<script setup>
import { computed, ref, watch } from 'vue';
import camelcaseKeys from 'camelcase-keys';
import { useI18n } from 'vue-i18n';

import CompanyAPI from 'dashboard/api/companies';
import ConversationCard from 'dashboard/components-next/Conversation/ConversationCard/ConversationCard.vue';
import Spinner from 'dashboard/components-next/spinner/Spinner.vue';
import { useMapGetter, useStore } from 'dashboard/composables/store';

const props = defineProps({
  companyId: {
    type: Number,
    required: true,
  },
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
});

const RESULTS_PER_PAGE = 15;

const { t } = useI18n();
const store = useStore();

const getContactConversations = useMapGetter(
  'contactConversations/getAllConversationsByContactId'
);
const stateInbox = useMapGetter('inboxes/getInboxById');
const accountLabels = useMapGetter('labels/getLabels');

const allCompanyContacts = ref([]);
const isFetchingHistory = ref(false);
const historyRequestToken = ref(0);
const accountLabelsValue = computed(() => accountLabels.value);

const normalizeContactRecord = record =>
  camelcaseKeys(record || {}, {
    deep: true,
    stopPaths: ['custom_attributes'],
  });

const companyContactsById = computed(() => {
  return allCompanyContacts.value.reduce((acc, contact) => {
    acc[contact.id] = contact;
    return acc;
  }, {});
});

const historyContactSignature = computed(() => {
  return props.contacts
    .map(contact => contact.id)
    .sort((a, b) => a - b)
    .join(',');
});

const totalContacts = computed(() =>
  Number(props.meta?.totalCount || props.contacts.length || 0)
);

const aggregatedConversations = computed(() => {
  const uniqueConversations = new Map();
  const conversationGetter = getContactConversations.value;

  allCompanyContacts.value.forEach(contact => {
    const records = conversationGetter(contact.id) || [];

    records.forEach(conversation => {
      uniqueConversations.set(conversation.id, {
        ...conversation,
        linkedContactId: contact.id,
      });
    });
  });

  return [...uniqueConversations.values()].sort(
    (conversationA, conversationB) => {
      const timestampA = Number(
        conversationA.lastActivityAt || conversationA.timestamp || 0
      );
      const timestampB = Number(
        conversationB.lastActivityAt || conversationB.timestamp || 0
      );

      return timestampB - timestampA;
    }
  );
});

const fetchAllCompanyContacts = async () => {
  const currentPage = Number(props.meta?.page || 1);
  const totalPages = Math.max(
    1,
    Math.ceil(totalContacts.value / RESULTS_PER_PAGE)
  );
  const contactsById = new Map(
    props.contacts.map(contact => [contact.id, contact])
  );
  const pagesToFetch = Array.from(
    { length: totalPages },
    (_, index) => index + 1
  ).filter(page => page !== currentPage);

  const responses = await Promise.all(
    pagesToFetch.map(page => CompanyAPI.listContacts(props.companyId, page))
  );

  responses.forEach(({ data: { payload = [] } }) => {
    payload
      .map(record => normalizeContactRecord(record))
      .forEach(contact => contactsById.set(contact.id, contact));
  });

  return [...contactsById.values()];
};

const loadHistory = async () => {
  if (!props.companyId) {
    return;
  }

  const requestToken = historyRequestToken.value + 1;
  historyRequestToken.value = requestToken;
  isFetchingHistory.value = true;

  try {
    const contacts = await fetchAllCompanyContacts();

    if (historyRequestToken.value !== requestToken) {
      return;
    }

    allCompanyContacts.value = contacts;

    await Promise.allSettled(
      contacts.map(contact =>
        store.dispatch('contactConversations/get', contact.id)
      )
    );
  } finally {
    if (historyRequestToken.value === requestToken) {
      isFetchingHistory.value = false;
    }
  }
};

watch(
  () =>
    `${props.companyId}:${props.meta?.page || 1}:${totalContacts.value}:${historyContactSignature.value}`,
  () => {
    loadHistory();
  },
  { immediate: true }
);

const contactForConversation = conversation => {
  const senderId = conversation.meta?.sender?.id;

  return (
    companyContactsById.value[senderId] ||
    companyContactsById.value[conversation.linkedContactId] || {
      name: t('COMPANIES.DETAIL.HISTORY.CONTACT_FALLBACK'),
    }
  );
};
</script>

<template>
  <div
    v-if="(isLoading || isFetchingHistory) && !aggregatedConversations.length"
    class="flex items-center justify-center py-10 text-n-slate-11"
  >
    <Spinner />
  </div>

  <p
    v-else-if="!aggregatedConversations.length"
    class="px-6 py-10 text-sm leading-6 text-center text-n-slate-11"
  >
    {{ t('COMPANIES.DETAIL.HISTORY.EMPTY') }}
  </p>

  <div
    v-else
    class="px-6 py-4 divide-y divide-n-strong [&>*:hover]:!border-y-transparent [&>*:hover+*]:!border-t-transparent"
  >
    <ConversationCard
      v-for="conversation in aggregatedConversations"
      :key="conversation.id"
      :conversation="conversation"
      :contact="contactForConversation(conversation)"
      :state-inbox="stateInbox(conversation.inboxId)"
      :account-labels="accountLabelsValue"
      class="rounded-none hover:rounded-xl hover:bg-n-alpha-1 dark:hover:bg-n-alpha-3"
    />
  </div>
</template>
