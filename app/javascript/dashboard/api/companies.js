/* global axios */
import ApiClient from './ApiClient';

const buildParams = params =>
  new URLSearchParams(
    Object.entries(params).filter(
      ([key, value]) => value !== undefined && (value !== '' || key === 'q')
    )
  ).toString();

class CompanyAPI extends ApiClient {
  constructor() {
    super('companies', { accountScoped: true });
  }

  get(params = {}) {
    const { page = 1, sort = 'name' } = params;
    const requestURL = `${this.url}?${buildParams({ page, sort })}`;
    return axios.get(requestURL);
  }

  search(query = '', page = 1, sort = 'name') {
    const requestURL = `${this.url}/search?${buildParams({ q: query, page, sort })}`;
    return axios.get(requestURL);
  }

  create(payload) {
    return axios.post(this.url, payload);
  }

  listContacts(id, page = 1) {
    return axios.get(`${this.url}/${id}/contacts?${buildParams({ page })}`);
  }

  searchContacts(id, query, page = 1) {
    return axios.get(
      `${this.url}/${id}/contacts/search?${buildParams({ q: query, page })}`
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
