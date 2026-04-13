import { setActivePinia, createPinia } from 'pinia';
import CompanyAPI from 'dashboard/api/companies';
import { useCompaniesStore } from './companies';

vi.mock('dashboard/api/companies', () => ({
  default: {
    show: vi.fn(),
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
});
