export type ProductSurface = Record<string, boolean>;

export type NexusBootstrap = {
  accountId: string;
  apiBaseUrl: string;
  appVersion: string;
  gitSha?: string;
  hostUrl: string;
  installationName: string;
  locale: string;
  productSurface: ProductSurface;
  pubsubToken?: string;
  user?: {
    id?: number | string;
    name?: string;
    email?: string;
    permissions?: string[];
  };
};

const toStringValue = (value: unknown, fallback = '') => {
  if (value === undefined || value === null || value === '') return fallback;

  return String(value);
};

export const getBootstrap = (): NexusBootstrap => {
  const chatwootConfig = window.chatwootConfig ?? {};
  const globalConfig = window.globalConfig ?? {};
  const user = chatwootConfig.user;
  const accountId = toStringValue(chatwootConfig.accountId, 'local-account');
  const hostUrl = chatwootConfig.hostURL ?? window.location.origin;

  return {
    accountId,
    apiBaseUrl: `${hostUrl}/api/v1/accounts/${accountId}`,
    appVersion: globalConfig.APP_VERSION ?? 'local',
    gitSha: globalConfig.GIT_SHA,
    hostUrl,
    installationName: globalConfig.INSTALLATION_NAME ?? 'Nexus',
    locale: chatwootConfig.selectedLocale ?? 'pt-BR',
    productSurface: chatwootConfig.productSurface ?? {},
    pubsubToken: toStringValue(chatwootConfig.pubsubToken),
    user,
  };
};

export const hasProductSurface = (key: string) => getBootstrap().productSurface[key] === true;
