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

    it('#get includes pagination and sorting params', () => {
      companyAPI.get({});
      expect(axiosMock.get).toHaveBeenCalledWith(
        '/api/v1/companies?page=1&sort=name'
      );
    });

    it('#search encodes query params', () => {
      companyAPI.search('acme & co', 2, 'domain');
      expect(axiosMock.get).toHaveBeenCalledWith(
        '/api/v1/companies/search?q=acme+%26+co&page=2&sort=domain'
      );
    });

    it('#search keeps empty query param for backend validation', () => {
      companyAPI.search('', 1, 'name');
      expect(axiosMock.get).toHaveBeenCalledWith(
        '/api/v1/companies/search?q=&page=1&sort=name'
      );
    });

    it('#linkContact posts to the nested company contacts endpoint', () => {
      companyAPI.linkContact(1, { contact_id: 2 });
      expect(axiosMock.post).toHaveBeenCalledWith(
        '/api/v1/companies/1/contacts',
        { contact_id: 2 }
      );
    });
  });
});
