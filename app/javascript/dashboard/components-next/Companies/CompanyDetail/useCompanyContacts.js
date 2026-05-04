import { computed, unref } from 'vue';
import camelcaseKeys from 'camelcase-keys';

const normalizeContactRecord = record =>
  camelcaseKeys(record || {}, {
    deep: true,
    stopPaths: ['custom_attributes'],
  });

export const useCompanyContacts = ({ contacts }) => {
  const allCompanyContacts = computed(() =>
    unref(contacts).map(contact => normalizeContactRecord(contact))
  );

  const contactSignature = computed(() => {
    return allCompanyContacts.value
      .map(contact => contact.id)
      .sort((a, b) => a - b)
      .join(',');
  });

  const companyContactsById = computed(() => {
    return allCompanyContacts.value.reduce((acc, contact) => {
      acc[contact.id] = contact;
      return acc;
    }, {});
  });

  return {
    allCompanyContacts,
    companyContactsById,
    contactSignature,
  };
};
