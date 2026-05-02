import { setActivePinia, createPinia } from 'pinia';
import CompanyAPI from 'dashboard/api/companies';
import { useCompaniesStore } from './companies';

vi.mock('dashboard/api/companies', () => ({
  default: {
    show: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    listContacts: vi.fn(),
    searchContacts: vi.fn(),
    linkContact: vi.fn(),
    removeContact: vi.fn(),
  },
}));

vi.mock('dashboard/store/utils/api', () => ({
  throwErrorMessage: vi.fn(error => error),
}));

const createDeferred = () => {
  let resolve;
  const promise = new Promise(res => {
    resolve = res;
  });

  return { promise, resolve };
};

describe('companies store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('keeps the latest active company when show requests resolve out of order', async () => {
    const firstRequest = createDeferred();
    const secondRequest = createDeferred();

    CompanyAPI.show
      .mockImplementationOnce(() => firstRequest.promise)
      .mockImplementationOnce(() => secondRequest.promise);

    const companiesStore = useCompaniesStore();

    const staleRequest = companiesStore.show(1);
    const currentRequest = companiesStore.show(2);

    secondRequest.resolve({
      data: {
        payload: {
          id: 2,
          name: 'Beta Company',
        },
      },
    });

    await currentRequest;

    expect(companiesStore.activeCompanyId).toBe(2);
    expect(companiesStore.getUIFlags.fetchingItem).toBe(false);

    firstRequest.resolve({
      data: {
        payload: {
          id: 1,
          name: 'Alpha Company',
        },
      },
    });

    await staleRequest;

    expect(companiesStore.activeCompanyId).toBe(2);
    expect(companiesStore.getRecord(1)).toEqual({});
    expect(companiesStore.getRecord(2)).toEqual(
      expect.objectContaining({ id: 2, name: 'Beta Company' })
    );
    expect(companiesStore.getUIFlags.fetchingItem).toBe(false);
  });

  it('does not let stale show responses overwrite a newer company record', async () => {
    const firstRequest = createDeferred();
    const secondRequest = createDeferred();

    CompanyAPI.show
      .mockImplementationOnce(() => firstRequest.promise)
      .mockImplementationOnce(() => secondRequest.promise);

    const companiesStore = useCompaniesStore();

    const staleRequest = companiesStore.show(1);
    const currentRequest = companiesStore.show(1);

    secondRequest.resolve({
      data: {
        payload: {
          id: 1,
          name: 'Current Company',
        },
      },
    });

    await currentRequest;

    firstRequest.resolve({
      data: {
        payload: {
          id: 1,
          name: 'Stale Company',
        },
      },
    });

    await staleRequest;

    expect(companiesStore.getRecord(1)).toEqual(
      expect.objectContaining({ id: 1, name: 'Current Company' })
    );
  });

  it('keeps avatar files intact when building multipart update params', async () => {
    CompanyAPI.update.mockResolvedValueOnce({
      data: {
        payload: {
          id: 1,
          name: 'Acme',
        },
      },
    });

    const companiesStore = useCompaniesStore();
    const avatar = new File(['avatar'], 'avatar.png', { type: 'image/png' });

    await companiesStore.update({
      id: 1,
      name: 'Acme',
      avatar,
    });

    const formData = CompanyAPI.update.mock.calls[0][1];
    expect(formData.get('company[avatar]')).toBe(avatar);
    expect(formData.get('company[name]')).toBe('Acme');
  });

  it('ignores stale company contacts requests when another company is active', async () => {
    const companiesStore = useCompaniesStore();
    companiesStore.setActiveCompanyId(2);

    const staleRequest = companiesStore.getCompanyContacts(1);

    expect(companiesStore.activeCompanyId).toBe(2);

    await staleRequest;

    expect(CompanyAPI.listContacts).not.toHaveBeenCalled();
    expect(companiesStore.activeCompanyId).toBe(2);
    expect(companiesStore.companyContacts).toEqual([]);
    expect(companiesStore.companyContactsMeta).toEqual({});
    expect(companiesStore.getUIFlags.fetchingContacts).toBe(false);
  });

  it('ignores stale company contact searches when another company is active', async () => {
    const companiesStore = useCompaniesStore();
    companiesStore.setActiveCompanyId(2);

    const results = await companiesStore.searchCompanyContactCandidates(
      1,
      'alpha'
    );

    expect(results).toEqual([]);
    expect(CompanyAPI.searchContacts).not.toHaveBeenCalled();
    expect(companiesStore.activeCompanyId).toBe(2);
    expect(companiesStore.contactSearchResults).toEqual([]);
  });

  it('decrements the removed contact count on the company being modified even if the active company changes mid-request', async () => {
    const removeRequest = createDeferred();
    CompanyAPI.removeContact.mockImplementationOnce(
      () => removeRequest.promise
    );

    const companiesStore = useCompaniesStore();
    companiesStore.records = [
      { id: 1, name: 'Alpha Company', contactsCount: 3 },
      { id: 2, name: 'Beta Company', contactsCount: 7 },
    ];
    companiesStore.companyContactsMeta = { page: 1 };
    companiesStore.setActiveCompanyId(1);

    const removal = companiesStore.removeContactFromCompany(1, 101);

    companiesStore.setActiveCompanyId(2);

    removeRequest.resolve({});
    await removal;

    expect(companiesStore.getRecord(1).contactsCount).toBe(2);
    expect(companiesStore.getRecord(2).contactsCount).toBe(7);
    expect(companiesStore.activeCompanyId).toBe(2);
  });

  it('does not write stale linked contact search results after active company changes', async () => {
    const linkRequest = createDeferred();
    CompanyAPI.linkContact.mockImplementationOnce(() => linkRequest.promise);

    const companiesStore = useCompaniesStore();
    companiesStore.contactSearchResults = [
      { id: 101, name: 'Tony Stark', linkedToCurrentCompany: false },
    ];
    companiesStore.companyContactsMeta = { page: 1 };
    companiesStore.setActiveCompanyId(1);

    const link = companiesStore.attachContactToCompany(1, 101);

    companiesStore.setActiveCompanyId(2);

    linkRequest.resolve({
      data: {
        payload: {
          id: 101,
          name: 'Tony Stark',
          linked_to_current_company: true,
        },
      },
    });

    await link;

    expect(companiesStore.contactSearchResults).toEqual([
      { id: 101, name: 'Tony Stark', linkedToCurrentCompany: false },
    ]);
    expect(CompanyAPI.listContacts).not.toHaveBeenCalled();
  });
});
