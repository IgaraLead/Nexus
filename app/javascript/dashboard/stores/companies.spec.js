import { setActivePinia, createPinia } from 'pinia';
import CompanyAPI from 'dashboard/api/companies';
import { useCompaniesStore } from './companies';

vi.mock('dashboard/api/companies', () => ({
  default: {
    show: vi.fn(),
    update: vi.fn(),
    destroyAvatar: vi.fn(),
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

  it('resets detail state without clearing cached company records', () => {
    const companiesStore = useCompaniesStore();
    companiesStore.records = [{ id: 1, name: 'Acme' }];
    companiesStore.setActiveCompanyId(1);
    companiesStore.setUIFlag({ fetchingItem: true, deletingAvatar: true });

    companiesStore.resetCompanyDetailState();

    expect(companiesStore.activeCompanyId).toBeNull();
    expect(companiesStore.records).toEqual([{ id: 1, name: 'Acme' }]);
    expect(companiesStore.getUIFlags.fetchingItem).toBe(false);
    expect(companiesStore.getUIFlags.deletingAvatar).toBe(false);
  });
});
