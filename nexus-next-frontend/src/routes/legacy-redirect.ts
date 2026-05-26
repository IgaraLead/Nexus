import { getBootstrap } from '../config/bootstrap';

export const getLegacyNexusUrl = (path: string) => {
  const legacyBaseUrl = import.meta.env.VITE_NEXUS_URL || `${getBootstrap().hostUrl}/app`;

  return `${legacyBaseUrl}${path === '/' ? '' : path}`;
};

export const redirectToLegacyNexus = (path: string) => {
  window.location.assign(getLegacyNexusUrl(path));
};
