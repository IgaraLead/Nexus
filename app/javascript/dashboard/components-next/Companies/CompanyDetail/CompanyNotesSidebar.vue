<script setup>
import { computed, ref, watch } from 'vue';
import camelcaseKeys from 'camelcase-keys';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

import CompanyAPI from 'dashboard/api/companies';
import ContactNoteItem from 'dashboard/components-next/Contacts/ContactsSidebar/components/ContactNoteItem.vue';
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
});

const RESULTS_PER_PAGE = 15;

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useStore();

const notesByContactId = useMapGetter('contactNotes/getAllNotesByContactId');
const currentUser = useMapGetter('getCurrentUser');

const allCompanyContacts = ref([]);
const isFetchingNotes = ref(false);
const notesRequestToken = ref(0);

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

const notesContactSignature = computed(() => {
  return props.contacts
    .map(contact => contact.id)
    .sort((a, b) => a - b)
    .join(',');
});

const totalContacts = computed(() =>
  Number(props.meta?.totalCount || props.contacts.length || 0)
);

const aggregatedNotes = computed(() => {
  const allNotes = [];
  const notesGetter = notesByContactId.value;

  allCompanyContacts.value.forEach(contact => {
    const records = notesGetter(contact.id) || [];

    records.forEach(note => {
      allNotes.push({
        ...note,
        linkedContactId: contact.id,
      });
    });
  });

  return allNotes.sort((noteA, noteB) => {
    return Number(noteB.createdAt || 0) - Number(noteA.createdAt || 0);
  });
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

const loadNotes = async () => {
  if (!props.companyId) {
    return;
  }

  const requestToken = notesRequestToken.value + 1;
  notesRequestToken.value = requestToken;
  isFetchingNotes.value = true;

  try {
    const contacts = await fetchAllCompanyContacts();

    if (notesRequestToken.value !== requestToken) {
      return;
    }

    allCompanyContacts.value = contacts;

    await Promise.allSettled(
      contacts.map(contact =>
        store.dispatch('contactNotes/get', { contactId: contact.id })
      )
    );
  } finally {
    if (notesRequestToken.value === requestToken) {
      isFetchingNotes.value = false;
    }
  }
};

watch(
  () =>
    `${props.companyId}:${props.meta?.page || 1}:${totalContacts.value}:${notesContactSignature.value}`,
  () => {
    loadNotes();
  },
  { immediate: true }
);

const contactForNote = note => {
  return companyContactsById.value[note.linkedContactId] || {};
};

const contactName = note =>
  contactForNote(note).name || t('COMPANIES.DETAIL.NOTES.CONTACT_FALLBACK');

const noteAuthorName = note => note?.user?.name || 'Bot';

const canOpenContact = note => Boolean(contactForNote(note).id);

const canOpenAgent = note => Boolean(note?.user?.id);

const openContact = note => {
  if (!canOpenContact(note)) {
    return;
  }

  router.push({
    name: 'contacts_edit',
    params: {
      accountId: route.params.accountId,
      contactId: note.linkedContactId,
    },
  });
};

const openAgent = note => {
  if (!canOpenAgent(note)) {
    return;
  }

  const isCurrentUser = Number(note.user.id) === Number(currentUser.value?.id);

  router.push({
    name: isCurrentUser ? 'profile_settings_index' : 'agent_list',
    params: {
      accountId: route.params.accountId,
    },
  });
};
</script>

<template>
  <div class="flex flex-col">
    <div
      v-if="isFetchingNotes && !aggregatedNotes.length"
      class="flex items-center justify-center py-10 text-n-slate-11"
    >
      <Spinner />
    </div>

    <div v-else-if="aggregatedNotes.length">
      <ContactNoteItem
        v-for="note in aggregatedNotes"
        :key="`${note.linkedContactId}-${note.id}`"
        class="mx-6 py-4"
        :note="note"
        :written-by="contactName(note)"
        :avatar-name="contactName(note)"
        :avatar-src="contactForNote(note).thumbnail"
        :metadata-prefix="t('COMPANIES.DETAIL.NOTES.ADDED_BY')"
        :metadata-value="noteAuthorName(note)"
        :written-by-clickable="canOpenContact(note)"
        :metadata-value-clickable="canOpenAgent(note)"
        collapsible
        @written-by-click="openContact(note)"
        @metadata-click="openAgent(note)"
      />
    </div>

    <p v-else class="px-6 py-10 text-sm leading-6 text-center text-n-slate-11">
      {{ t('COMPANIES.DETAIL.NOTES.EMPTY') }}
    </p>
  </div>
</template>
