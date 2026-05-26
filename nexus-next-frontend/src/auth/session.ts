import { getBootstrap } from '../config/bootstrap';

const getMetaContent = (name: string) => document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content;

export const getCsrfToken = () => getMetaContent('csrf-token') ?? '';

export const getSessionHeaders = () => {
  const csrfToken = getCsrfToken();

  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
  };
};

export const getCurrentAccountId = () => getBootstrap().accountId;

export const getCurrentUser = () => getBootstrap().user;

export const hasPermission = (permission: string) => {
  const permissions = getCurrentUser()?.permissions ?? [];

  return permissions.includes(permission);
};
