/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NEXUS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    chatwootConfig?: {
      accountId?: number | string;
      hostURL?: string;
      productSurface?: Record<string, boolean>;
      pubsubToken?: string;
      selectedLocale?: string;
      user?: {
        id?: number | string;
        name?: string;
        email?: string;
        permissions?: string[];
      };
    };
    globalConfig?: {
      INSTALLATION_NAME?: string;
      APP_VERSION?: string;
      GIT_SHA?: string;
    };
  }
}

export {};
