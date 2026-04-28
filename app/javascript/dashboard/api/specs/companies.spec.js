import companyAPI from '../companies';
import ApiClient from '../ApiClient';

describe('#CompanyAPI', () => {
  it('creates correct instance', () => {
    expect(companyAPI).toBeInstanceOf(ApiClient);
    expect(companyAPI).toHaveProperty('get');
    expect(companyAPI).toHaveProperty('show');
    expect(companyAPI).toHaveProperty('create');
    expect(companyAPI).toHaveProperty('update');
    expect(companyAPI).toHaveProperty('delete');
    expect(companyAPI).toHaveProperty('search');
  });

  describe('API calls', () => {
    const originalAxios = window.axios;
    const axiosMock = {
      post: vi.fn(() => Promise.resolve()),
      get: vi.fn(() => Promise.resolve()),
      patch: vi.fn(() => Promise.resolve()),
      delete: vi.fn(() => Promise.resolve()),
    };

    beforeEach(() => {
      window.axios = axiosMock;
    });

    afterEach(() => {
      window.axios = originalAxios;
    });

    it('#get with default params', () => {
      companyAPI.get({});
      expect(axiosMock.get).toHaveBeenCalledWith(
        '/api/v1/companies?page=1&sort=name'
      );
    });

    it('#get with page and sort params', () => {
      companyAPI.get({ page: 2, sort: 'domain' });
      expect(axiosMock.get).toHaveBeenCalledWith(
        '/api/v1/companies?page=2&sort=domain'
      );
    });

    it('#get with descending sort', () => {
      companyAPI.get({ page: 1, sort: '-created_at' });
      expect(axiosMock.get).toHaveBeenCalledWith(
        '/api/v1/companies?page=1&sort=-created_at'
      );
    });

    it('#search with query', () => {
      companyAPI.search('acme', 1, 'name');
      expect(axiosMock.get).toHaveBeenCalledWith(
        '/api/v1/companies/search?q=acme&page=1&sort=name'
      );
    });

    it('#search with special characters in query', () => {
      companyAPI.search('acme & co', 2, 'domain');
      expect(axiosMock.get).toHaveBeenCalledWith(
        '/api/v1/companies/search?q=acme%20%26%20co&page=2&sort=domain'
      );
    });

    it('#search with descending sort', () => {
      companyAPI.search('test', 1, '-created_at');
      expect(axiosMock.get).toHaveBeenCalledWith(
        '/api/v1/companies/search?q=test&page=1&sort=-created_at'
      );
    });

    it('#search with empty query', () => {
      companyAPI.search('', 1, 'name');
      expect(axiosMock.get).toHaveBeenCalledWith(
        '/api/v1/companies/search?q=&page=1&sort=name'
      );
    });
  });
});
