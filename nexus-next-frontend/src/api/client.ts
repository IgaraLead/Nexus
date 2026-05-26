import { getSessionHeaders } from '../auth/session';
import { getBootstrap } from '../config/bootstrap';
import { ApiError } from './errors';

type ApiRequestOptions = Omit<RequestInit, 'body'> & {
  body?: BodyInit | Record<string, unknown> | null;
  searchParams?: Record<string, string | number | boolean | undefined | null>;
  version?: 'v1' | 'v2';
};

const buildUrl = (path: string, options?: ApiRequestOptions) => {
  const { accountId, hostUrl } = getBootstrap();
  const version = options?.version ?? 'v1';
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const baseUrl = `${hostUrl}/api/${version}/accounts/${accountId}`;
  const url = new URL(`${baseUrl}${normalizedPath}`);

  Object.entries(options?.searchParams ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
};

const parseResponse = async <T>(response: Response): Promise<T> => {
  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    throw new ApiError(response.statusText || 'Request failed', response.status, payload);
  }

  return payload as T;
};

export const apiRequest = async <T>(path: string, options: ApiRequestOptions = {}) => {
  const headers = {
    ...getSessionHeaders(),
    ...options.headers,
  };
  const body =
    options.body && typeof options.body === 'object' && !(options.body instanceof FormData)
      ? JSON.stringify(options.body)
      : options.body;
  const response = await fetch(buildUrl(path, options), {
    credentials: 'include',
    ...options,
    body,
    headers,
  });

  return parseResponse<T>(response);
};
