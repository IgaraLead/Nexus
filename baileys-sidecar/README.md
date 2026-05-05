# Baileys sidecar

**First-party component of the Nexus repo** — lives at `nexus/baileys-sidecar/` (not a separate Git project).

HTTP wrapper around [**@whiskeysockets/baileys**](https://www.npmjs.com/package/@whiskeysockets/baileys) for WhatsApp. Session files live under `{SESSIONS_DIR}/{client_slug}/{session_id}/` for multi-tenant isolation.

**Production:** build this image only (`./baileys-sidecar`); no fork of the Baileys library is required. The previous `@igaralead/baileys` fork only added `tagSession()` in the library, which the sidecar never used — tenancy is enforced via filesystem paths and `client_slug` on the API.

## Commands

```bash
npm install
npm run build
npm test
npm run dev
```

## Docker

```bash
docker build -t baileys-sidecar:local .
```

Same contract as before: `BAILEYS_SIDECAR_API_KEY`, `NEXUS_WEBHOOK_URL`, `SESSIONS_DIR`, port `3500`.
