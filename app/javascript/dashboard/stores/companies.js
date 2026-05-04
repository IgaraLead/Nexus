import { defineStore } from 'pinia';
import CompanyAPI from 'dashboard/api/companies';
import { throwErrorMessage } from 'dashboard/store/utils/api';
import camelcaseKeys from 'camelcase-keys';
import snakecaseKeys from 'snakecase-keys';

const createInitialUIFlags = () => ({
  fetchingList: false,
  fetchingItem: false,
  updatingItem: false,
  deletingItem: false,
  deletingAvatar: false,
});

const createInitialState = () => ({
  records: [],
  meta: {},
  uiFlags: createInitialUIFlags(),
  activeCompanyId: null,
  companyDetailRequestToken: 0,
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

    ensureActiveCompanyContext(companyId) {
      if (this.activeCompanyId === null) {
        this.setActiveCompanyId(companyId);
      }
    },

    upsertCompanyRecord(record) {
      this.records = upsertRecord(this.records, normalizeCompanyRecord(record));
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
      this.activeCompanyId = null;
      this.companyDetailRequestToken += 1;
      this.setUIFlag({
        fetchingItem: false,
        deletingAvatar: false,
      });
    },
  },
});
