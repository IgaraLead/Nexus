import { setActivePinia, createPinia } from 'pinia';
import CompanyAPI from 'dashboard/api/companies';
import { useCompaniesStore } from './companies';

vi.mock('dashboard/api/companies', () => ({
  default: {
    show: vi.fn(),
    listContacts: vi.fn(),
    searchContacts: vi.fn(),
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
    expect(companiesStore.getRecord(1)).toEqual(
      expect.objectContaining({ id: 1, name: 'Alpha Company' })
    );
    expect(companiesStore.getRecord(2)).toEqual(
      expect.objectContaining({ id: 2, name: 'Beta Company' })
    );
    expect(companiesStore.getUIFlags.fetchingItem).toBe(false);
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
    expect(companiesStore.contactSearchMeta).toEqual({});
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
});
