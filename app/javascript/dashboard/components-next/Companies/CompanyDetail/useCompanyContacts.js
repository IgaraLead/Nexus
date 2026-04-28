import { computed, ref, unref } from 'vue';
import camelcaseKeys from 'camelcase-keys';

import CompanyAPI from 'dashboard/api/companies';

const RESULTS_PER_PAGE = 15;

const normalizeContactRecord = record =>
  camelcaseKeys(record || {}, {
    deep: true,
    stopPaths: ['custom_attributes'],
  });

export const useCompanyContacts = ({ companyId, contacts, meta }) => {
  const allCompanyContacts = ref([]);

  const totalContacts = computed(() =>
    Number(unref(meta)?.totalCount || unref(contacts).length || 0)
  );

  const contactSignature = computed(() => {
    return unref(contacts)
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

  const fetchAllCompanyContacts = async () => {
    const currentPage = Number(unref(meta)?.page || 1);
    const totalPages = Math.max(
      1,
      Math.ceil(totalContacts.value / RESULTS_PER_PAGE)
    );
    const contactsById = new Map(
      unref(contacts).map(contact => [contact.id, contact])
    );
    const pagesToFetch = Array.from(
      { length: totalPages },
      (_, index) => index + 1
    ).filter(page => page !== currentPage);

    const responses = await Promise.all(
      pagesToFetch.map(page => CompanyAPI.listContacts(unref(companyId), page))
    );

    responses.forEach(({ data: { payload = [] } }) => {
      payload
        .map(record => normalizeContactRecord(record))
        .forEach(contact => contactsById.set(contact.id, contact));
    });

    return [...contactsById.values()];
  };

  return {
    allCompanyContacts,
    companyContactsById,
    contactSignature,
    fetchAllCompanyContacts,
    totalContacts,
  };
};
