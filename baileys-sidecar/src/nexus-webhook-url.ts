/**
 * Undici fetch() requires a full URL with scheme. Values like `host:3000` parse as an unknown scheme.
 */
export function normalizeNexusWebhookBaseUrl(raw: string): string {
  let s = raw.trim()
  if (!s) {
    s = 'http://localhost:3000'
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    s = `http://${s}`
  }
  return s.replace(/\/+$/, '')
}
