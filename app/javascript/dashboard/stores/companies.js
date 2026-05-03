import { defineStore } from 'pinia';
import CompanyAPI from 'dashboard/api/companies';
import { throwErrorMessage } from 'dashboard/store/utils/api';
import camelcaseKeys from 'camelcase-keys';
import snakecaseKeys from 'snakecase-keys';

const createInitialUIFlags = () => ({
  fetchingList: false,
  fetchingItem: false,
  creatingItem: false,
  updatingItem: false,
  deletingItem: false,
  fetchingContacts: false,
  searchingContacts: false,
  linkingContact: false,
  removingContact: false,
  deletingAvatar: false,
});

const createInitialState = () => ({
  records: [],
  meta: {},
  uiFlags: createInitialUIFlags(),
  companyContacts: [],
  companyContactsMeta: {},
  contactSearchResults: [],
  activeCompanyId: null,
  companyDetailRequestToken: 0,
  companyContactsRequestToken: 0,
  contactSearchRequestToken: 0,
  activeContactSearchQuery: '',
});

const normalizeCompanyRecord = record =>
  camelcaseKeys(record || {}, {
    deep: true,
    stopPaths: ['custom_attributes'],
  });

const normalizeCompanyCollection = collection =>
  camelcaseKeys(collection || [], {
    deep: true,
    stopPaths: ['custom_attributes'],
  });

const normalizeContactRecord = record =>
  camelcaseKeys(record || {}, {
    deep: true,
    stopPaths: ['custom_attributes'],
  });

const normalizeContactCollection = collection =>
  (collection || []).map(normalizeContactRecord);

const normalizeMeta = meta => ({
  ...camelcaseKeys(meta || {}),
  totalCount: Number(meta?.total_count || meta?.totalCount || 0),
  page: Number(meta?.page || 1),
});

const upsertRecord = (records, record) => {
  const index = records.findIndex(
    existingRecord => existingRecord.id === record.id
  );

  if (index === -1) {
    return [...records, record];
  }

  return records.map(existingRecord =>
    existingRecord.id === record.id ? record : existingRecord
  );
};

const updateContactInCollection = (contacts, contactId, updater) =>
  contacts.map(contact =>
    contact.id === Number(contactId) ? updater(contact) : contact
  );

const appendFormDataValue = (formData, key, value) => {
  if (value === undefined || value === null || value === '') {
    return;
  }

  if (value instanceof File || value instanceof Blob) {
    formData.append(key, value);
    return;
  }

  if (typeof value === 'object') {
    Object.entries(value).forEach(([nestedKey, nestedValue]) => {
      appendFormDataValue(formData, `${key}[${nestedKey}]`, nestedValue);
    });
    return;
  }

  formData.append(key, value);
};

const buildCompanyFormData = payload => {
  const formData = new FormData();

  Object.entries(payload).forEach(([key, value]) => {
    appendFormDataValue(formData, `company[${key}]`, value);
  });

  return formData;
};

const buildCompanyPayload = companyAttrs => {
  const { avatar, ...attrsToDecamelize } = companyAttrs;

  return {
    ...snakecaseKeys(attrsToDecamelize, { deep: true }),
    ...(avatar && { avatar }),
  };
};

const buildCompanyRequestPayload = companyAttrs => {
  const payload = buildCompanyPayload(companyAttrs);

  return companyAttrs.avatar
    ? buildCompanyFormData(payload)
    : { company: payload };
};

export const useCompaniesStore = defineStore('companies', {
  state: createInitialState,

  getters: {
    getRecord: state => id =>
      state.records.find(record => record.id === Number(id)) || {},
    getUIFlags: state => state.uiFlags,
    getMeta: state => state.meta,
    getCompaniesList: state => state.records,
  },

  actions: {
    setUIFlag(data) {
      this.uiFlags = {
        ...this.uiFlags,
        ...data,
      };
    },

    setMeta(meta) {
      this.meta = normalizeMeta(meta);
    },

    setActiveCompanyId(companyId) {
      this.activeCompanyId = Number(companyId);
    },

    hasActiveCompanyContext(companyId) {
      return (
        this.activeCompanyId === null ||
        this.activeCompanyId === Number(companyId)
      );
    },

    ensureActiveCompanyContext(companyId) {
      if (this.activeCompanyId === null) {
        this.setActiveCompanyId(companyId);
      }
    },

    upsertCompanyRecord(record) {
      this.records = upsertRecord(this.records, normalizeCompanyRecord(record));
    },

    updateCompanyCount(companyId, delta) {
      const company = this.records.find(
        existingRecord => existingRecord.id === Number(companyId)
      );

      if (!company) {
        return;
      }

      this.upsertCompanyRecord({
        ...company,
        contactsCount: Math.max(0, Number(company.contactsCount || 0) + delta),
      });
    },

    async get({ page = 1, sort = 'name' } = {}) {
      this.setUIFlag({ fetchingList: true });
      try {
        const {
          data: { payload, meta },
        } = await CompanyAPI.get({ page, sort });
        this.records = normalizeCompanyCollection(payload);
        this.setMeta(meta);
        return this.records;
      } catch (error) {
        return throwErrorMessage(error);
      } finally {
        this.setUIFlag({ fetchingList: false });
      }
    },

    async show(id) {
      this.setUIFlag({ fetchingItem: true });
      this.setActiveCompanyId(id);
      const activeCompanyId = Number(id);
      const requestToken = this.companyDetailRequestToken + 1;
      this.companyDetailRequestToken = requestToken;
      try {
        const {
          data: { payload },
        } = await CompanyAPI.show(id);
        const company = normalizeCompanyRecord(payload);

        if (
          this.companyDetailRequestToken !== requestToken ||
          this.activeCompanyId !== activeCompanyId
        ) {
          return company;
        }

        this.upsertCompanyRecord(company);
        this.setActiveCompanyId(company.id);
        return company;
      } catch (error) {
        return throwErrorMessage(error);
      } finally {
        if (this.companyDetailRequestToken === requestToken) {
          this.setUIFlag({ fetchingItem: false });
        }
      }
    },

    async create(companyAttrs) {
      this.setUIFlag({ creatingItem: true });
      try {
        const {
          data: { payload: createdPayload },
        } = await CompanyAPI.create(buildCompanyRequestPayload(companyAttrs));
        const company = normalizeCompanyRecord(createdPayload);
        this.upsertCompanyRecord(company);
        return company;
      } catch (error) {
        return throwErrorMessage(error);
      } finally {
        this.setUIFlag({ creatingItem: false });
      }
    },

    async update({ id, ...companyAttrs }) {
      this.setUIFlag({ updatingItem: true });
      try {
        const {
          data: { payload: updatedPayload },
        } = await CompanyAPI.update(
          id,
          buildCompanyRequestPayload(companyAttrs)
        );
        const company = normalizeCompanyRecord(updatedPayload);
        this.upsertCompanyRecord(company);
        return company;
      } catch (error) {
        return throwErrorMessage(error);
      } finally {
        this.setUIFlag({ updatingItem: false });
      }
    },

    async delete(id) {
      this.setUIFlag({ deletingItem: true });
      try {
        await CompanyAPI.delete(id);
        this.records = this.records.filter(record => record.id !== Number(id));
        if (this.activeCompanyId === Number(id)) {
          this.resetCompanyDetailState();
        }
        return Number(id);
      } catch (error) {
        return throwErrorMessage(error);
      } finally {
        this.setUIFlag({ deletingItem: false });
      }
    },

    async search({ search, page = 1, sort = 'name' }) {
      this.setUIFlag({ fetchingList: true });
      try {
        const {
          data: { payload, meta },
        } = await CompanyAPI.search(search, page, sort);
        this.records = normalizeCompanyCollection(payload);
        this.setMeta(meta);
        return this.records;
      } catch (error) {
        return throwErrorMessage(error);
      } finally {
        this.setUIFlag({ fetchingList: false });
      }
    },

    async getCompanyContacts(companyId, page = 1) {
      if (!this.hasActiveCompanyContext(companyId)) {
        return [];
      }

      this.setUIFlag({ fetchingContacts: true });
      this.ensureActiveCompanyContext(companyId);
      const activeCompanyId = Number(companyId);
      const requestToken = this.companyContactsRequestToken + 1;
      this.companyContactsRequestToken = requestToken;
      try {
        const {
          data: { payload, meta },
        } = await CompanyAPI.listContacts(companyId, page);

        const contacts = normalizeContactCollection(payload);

        if (
          this.companyContactsRequestToken !== requestToken ||
          this.activeCompanyId !== activeCompanyId
        ) {
          return contacts;
        }

        this.companyContacts = contacts;
        this.companyContactsMeta = normalizeMeta(meta);
        return contacts;
      } catch (error) {
        return throwErrorMessage(error);
      } finally {
        if (this.companyContactsRequestToken === requestToken) {
          this.setUIFlag({ fetchingContacts: false });
        }
      }
    },

    async searchCompanyContactCandidates(companyId, query, page = 1) {
      if (!this.hasActiveCompanyContext(companyId)) {
        return [];
      }

      this.ensureActiveCompanyContext(companyId);
      const activeCompanyId = Number(companyId);
      const normalizedQuery = query?.trim() || '';
      const requestToken = this.contactSearchRequestToken + 1;
      this.contactSearchRequestToken = requestToken;
      this.activeContactSearchQuery = normalizedQuery;

      if (!normalizedQuery) {
        this.contactSearchResults = [];
        this.setUIFlag({ searchingContacts: false });
        return this.contactSearchResults;
      }

      this.setUIFlag({ searchingContacts: true });
      try {
        const {
          data: { payload },
        } = await CompanyAPI.searchContacts(companyId, normalizedQuery, page);

        const results = normalizeContactCollection(payload);

        if (
          this.contactSearchRequestToken !== requestToken ||
          this.activeCompanyId !== activeCompanyId ||
          this.activeContactSearchQuery !== normalizedQuery
        ) {
          return results;
        }

        this.contactSearchResults = results;
        return this.contactSearchResults;
      } catch (error) {
        return throwErrorMessage(error);
      } finally {
        if (this.contactSearchRequestToken === requestToken) {
          this.setUIFlag({ searchingContacts: false });
        }
      }
    },

    async attachContactToCompany(companyId, contactId) {
      this.setUIFlag({ linkingContact: true });
      this.ensureActiveCompanyContext(companyId);
      const currentPage = this.companyContactsMeta.page || 1;
      const numericCompanyId = Number(companyId);
      const numericContactId = Number(contactId);
      const previousCompanyId = this.contactSearchResults.find(
        contact => contact.id === numericContactId
      )?.companyId;
      try {
        await CompanyAPI.linkContact(companyId, {
          contact_id: contactId,
        });

        if (this.activeCompanyId !== numericCompanyId) {
          return numericContactId;
        }

        this.contactSearchResults = this.contactSearchResults.filter(
          contact => contact.id !== numericContactId
        );
        if (previousCompanyId && previousCompanyId !== numericCompanyId) {
          this.updateCompanyCount(previousCompanyId, -1);
        }
        this.updateCompanyCount(companyId, 1);
        await this.getCompanyContacts(companyId, currentPage);
        return numericContactId;
      } catch (error) {
        return throwErrorMessage(error);
      } finally {
        this.setUIFlag({ linkingContact: false });
      }
    },

    async removeContactFromCompany(companyId, contactId, page) {
      this.setUIFlag({ removingContact: true });
      this.ensureActiveCompanyContext(companyId);
      const currentPage = page || this.companyContactsMeta.page || 1;
      try {
        await CompanyAPI.removeContact(companyId, contactId);
        this.contactSearchResults = updateContactInCollection(
          this.contactSearchResults,
          contactId,
          contact => ({
            ...contact,
            companyId: null,
            linkedToCurrentCompany: false,
            company: null,
          })
        );
        this.updateCompanyCount(companyId, -1);
        await this.getCompanyContacts(companyId, currentPage);
        return Number(contactId);
      } catch (error) {
        return throwErrorMessage(error);
      } finally {
        this.setUIFlag({ removingContact: false });
      }
    },

    async deleteCompanyAvatar(companyId) {
      this.setUIFlag({ deletingAvatar: true });
      this.ensureActiveCompanyContext(companyId);
      try {
        const {
          data: { payload },
        } = await CompanyAPI.destroyAvatar(companyId);
        const company = normalizeCompanyRecord(payload);
        this.upsertCompanyRecord(company);
        return company;
      } catch (error) {
        return throwErrorMessage(error);
      } finally {
        this.setUIFlag({ deletingAvatar: false });
      }
    },

    resetCompanyDetailState() {
      this.companyContacts = [];
      this.companyContactsMeta = {};
      this.contactSearchResults = [];
      this.activeCompanyId = null;
      this.companyDetailRequestToken += 1;
      this.companyContactsRequestToken += 1;
      this.contactSearchRequestToken += 1;
      this.activeContactSearchQuery = '';
      this.setUIFlag({
        fetchingItem: false,
        fetchingContacts: false,
        searchingContacts: false,
        linkingContact: false,
        removingContact: false,
        deletingAvatar: false,
      });
    },
  },
});
