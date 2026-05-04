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

  destroyAvatar(id) {
    return axios.delete(`${this.url}/${id}/avatar`);
  }
}

export default new CompanyAPI();
