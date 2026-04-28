/* global axios */
import ApiClient from './ApiClient';

export const buildCompanyParams = (page, sort) => {
  let params = `page=${page}`;
  if (sort) {
    params = `${params}&sort=${sort}`;
  }
  return params;
};

export const buildSearchParams = (query, page, sort) => {
  let params = `q=${encodeURIComponent(query)}&page=${page}`;
  if (sort) {
    params = `${params}&sort=${sort}`;
  }
  return params;
};

export const buildCompanyContactParams = page => `page=${page}`;

export const buildCompanyContactSearchParams = (query, page) =>
  `q=${encodeURIComponent(query)}&page=${page}`;

class CompanyAPI extends ApiClient {
  constructor() {
    super('companies', { accountScoped: true });
  }

  get(params = {}) {
    const { page = 1, sort = 'name' } = params;
    const requestURL = `${this.url}?${buildCompanyParams(page, sort)}`;
    return axios.get(requestURL);
  }

  search(query = '', page = 1, sort = 'name') {
    const requestURL = `${this.url}/search?${buildSearchParams(query, page, sort)}`;
    return axios.get(requestURL);
  }

  create(payload) {
    return axios.post(this.url, payload);
  }

  listContacts(id, page = 1) {
    return axios.get(
      `${this.url}/${id}/contacts?${buildCompanyContactParams(page)}`
    );
  }

  searchContacts(id, query, page = 1) {
    return axios.get(
      `${this.url}/${id}/contacts/search?${buildCompanyContactSearchParams(
        query,
        page
      )}`
    );
  }

  linkContact(id, payload) {
    return axios.post(`${this.url}/${id}/contacts`, payload);
  }

  removeContact(id, contactId) {
    return axios.delete(`${this.url}/${id}/contacts/${contactId}`);
  }

  destroyAvatar(id) {
    return axios.delete(`${this.url}/${id}/avatar`);
  }
}

export default new CompanyAPI();
