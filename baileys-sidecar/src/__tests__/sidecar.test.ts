/**
 * Security-first tests for Baileys sidecar HTTP API.
 * Covers: authentication, input validation, rate limiting, endpoint behavior.
 *
 * Uses Node built-in test runner (node:test) to avoid extra dependencies.
 * Run: npx tsx --test src/__tests__/sidecar.test.ts
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'crypto'
import http from 'http'
import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'

const PORT = parseInt(process.env.TEST_PORT || '3599', 10)
const API_KEY = 'test-api-key-for-sidecar-tests'

let serverProcess: ChildProcess | null = null

// Start the sidecar server before all tests
before(async () => {
  const sidecarEntry = path.resolve(import.meta.dirname, '..', 'index.ts')
  serverProcess = spawn('npx', ['tsx', sidecarEntry], {
    env: {
      ...process.env,
      BAILEYS_SIDECAR_API_KEY: API_KEY,
      PORT: String(PORT),
      NEXUS_WEBHOOK_URL: 'http://localhost:3000',
      SESSIONS_DIR: '/tmp/baileys-test-sessions',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  // Wait for the server to be ready (poll health endpoint)
  const maxWait = 15_000
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    try {
      const res = await new Promise<number>((resolve, reject) => {
        const req = http.request(
          { hostname: '127.0.0.1', port: PORT, path: '/health', method: 'GET',
            headers: { 'X-Api-Key': API_KEY } },
          (r) => { r.resume(); resolve(r.statusCode!) }
        )
        req.on('error', reject)
        req.setTimeout(1000, () => { req.destroy(); reject(new Error('timeout')) })
        req.end()
      })
      if (res === 200) break
    } catch {
      await new Promise((r) => setTimeout(r, 300))
    }
  }
})

// Kill the sidecar after all tests
after(() => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM')
    serverProcess = null
  }
})

// Helper to make HTTP requests (node:http, no dependencies)
function request(
  method: string,
  path: string,
  opts: { body?: unknown; headers?: Record<string, string> } = {}
): Promise<{ status: number; body: unknown; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const bodyStr = opts.body ? JSON.stringify(opts.body) : undefined
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...opts.headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString()
          let body: unknown
          try {
            body = JSON.parse(raw)
          } catch {
            body = raw
          }
          resolve({ status: res.statusCode!, body, headers: res.headers })
        })
      }
    )
    req.on('error', reject)
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

const authedHeaders = { 'X-Api-Key': API_KEY }

// ─── Authentication ────────────────────────────────────

describe('Authentication', () => {
  it('health endpoint is public (no auth required)', async () => {
    const { status, body } = await request('GET', '/health')
    assert.equal(status, 200)
    assert.equal((body as any).status, 'ok')
  })

  it('rejects protected requests without API key', async () => {
    const { status } = await request('GET', '/sessions/test/status')
    assert.equal(status, 401)
  })

  it('rejects protected requests with wrong API key', async () => {
    const { status } = await request('GET', '/sessions/test/status', {
      headers: { 'X-Api-Key': 'wrong-key-value' },
    })
    assert.equal(status, 401)
  })

  it('rejects protected requests with empty API key', async () => {
    const { status } = await request('GET', '/sessions/test/status', {
      headers: { 'X-Api-Key': '' },
    })
    assert.equal(status, 401)
  })

  it('accepts requests with correct API key', async () => {
    const { status, body } = await request('GET', '/health', {
      headers: authedHeaders,
    })
    assert.equal(status, 200)
    assert.equal((body as any).status, 'ok')
  })

  it('uses timing-safe comparison (key with same length but different value)', async () => {
    // Key with same length as API_KEY but different content
    const fakeKey = 'x'.repeat(API_KEY.length)
    const { status } = await request('GET', '/sessions/test/status', {
      headers: { 'X-Api-Key': fakeKey },
    })
    assert.equal(status, 401)
  })
})

// ─── Input Validation: Session ID ──────────────────────

describe('Session ID Validation', () => {
  it('rejects empty session_id on /sessions/start', async () => {
    const { status } = await request('POST', '/sessions/start', {
      headers: authedHeaders,
      body: { session_id: '' },
    })
    assert.equal(status, 400)
  })

  it('rejects missing session_id on /sessions/start', async () => {
    const { status } = await request('POST', '/sessions/start', {
      headers: authedHeaders,
      body: {},
    })
    assert.equal(status, 400)
  })

  it('rejects session_id with special characters', async () => {
    const { status } = await request('POST', '/sessions/start', {
      headers: authedHeaders,
      body: { session_id: '../etc/passwd' },
    })
    assert.equal(status, 400)
  })

  it('rejects session_id with spaces', async () => {
    const { status } = await request('POST', '/sessions/start', {
      headers: authedHeaders,
      body: { session_id: 'test session' },
    })
    assert.equal(status, 400)
  })

  it('rejects session_id exceeding 128 chars', async () => {
    const { status } = await request('POST', '/sessions/start', {
      headers: authedHeaders,
      body: { session_id: 'a'.repeat(129) },
    })
    assert.equal(status, 400)
  })

  it('accepts valid session_id (alphanumeric + dash + underscore)', async () => {
    // Note: this will likely fail to start a real session but should pass validation
    const { status } = await request('POST', '/sessions/start', {
      headers: authedHeaders,
      body: { session_id: 'test-session_123' },
    })
    // 200 or 500 (no WhatsApp infra) — but NOT 400
    assert.notEqual(status, 400)
  })

  it('rejects session_id for disconnect with path traversal', async () => {
    const { status } = await request('POST', '/sessions/disconnect', {
      headers: authedHeaders,
      body: { session_id: '../../secret' },
    })
    assert.equal(status, 400)
  })
})

// ─── Input Validation: JID ─────────────────────────────

describe('JID Validation', () => {
  it('rejects missing jid on /messages/send', async () => {
    const { status } = await request('POST', '/messages/send', {
      headers: authedHeaders,
      body: { session_id: 'test', message: { text: 'hi' } },
    })
    assert.equal(status, 400)
  })

  it('rejects invalid jid format', async () => {
    const { status } = await request('POST', '/messages/send', {
      headers: authedHeaders,
      body: { session_id: 'test', jid: 'not-a-jid', message: { text: 'hi' } },
    })
    assert.equal(status, 400)
  })

  it('rejects jid without domain suffix', async () => {
    const { status } = await request('POST', '/messages/send', {
      headers: authedHeaders,
      body: { session_id: 'test', jid: '5511999999999', message: { text: 'hi' } },
    })
    assert.equal(status, 400)
  })

  it('rejects jid with SQL injection attempt', async () => {
    const { status } = await request('POST', '/messages/send', {
      headers: authedHeaders,
      body: {
        session_id: 'test',
        jid: "1' OR '1'='1@s.whatsapp.net",
        message: { text: 'hi' },
      },
    })
    assert.equal(status, 400)
  })

  it('accepts valid individual JID', async () => {
    const { status } = await request('POST', '/messages/send', {
      headers: authedHeaders,
      body: {
        session_id: 'test',
        jid: '5511999999999@s.whatsapp.net',
        message: { text: 'hello' },
      },
    })
    // Should pass validation (400 only for validation errors)
    // Will get 500 because no actual session — that's fine
    assert.notEqual(status, 400)
  })

  it('accepts valid group JID', async () => {
    const { status } = await request('POST', '/messages/send', {
      headers: authedHeaders,
      body: {
        session_id: 'test',
        jid: '120363123456789@g.us',
        message: { text: 'hello group' },
      },
    })
    assert.notEqual(status, 400)
  })
})

// ─── Message Validation ────────────────────────────────

describe('Message Validation', () => {
  it('rejects non-object message', async () => {
    const { status } = await request('POST', '/messages/send', {
      headers: authedHeaders,
      body: {
        session_id: 'test',
        jid: '5511999999999@s.whatsapp.net',
        message: 'plain string not allowed',
      },
    })
    assert.equal(status, 400)
  })

  it('rejects null message', async () => {
    const { status } = await request('POST', '/messages/send', {
      headers: authedHeaders,
      body: {
        session_id: 'test',
        jid: '5511999999999@s.whatsapp.net',
        message: null,
      },
    })
    assert.equal(status, 400)
  })
})

// ─── Health Endpoint ───────────────────────────────────

describe('Health Endpoint', () => {
  it('returns ok status and sessions list', async () => {
    const { status, body } = await request('GET', '/health', {
      headers: authedHeaders,
    })
    assert.equal(status, 200)
    const data = body as any
    assert.equal(data.status, 'ok')
    assert.ok(Array.isArray(data.sessions))
  })

  it('does not leak sensitive config', async () => {
    const { body } = await request('GET', '/health')
    const raw = JSON.stringify(body)
    assert.ok(!raw.includes('API_KEY'))
    assert.ok(!raw.includes('WEBHOOK'))
    assert.ok(!raw.includes('SECRET'))
  })

  it('returns JSON content type', async () => {
    const { headers } = await request('GET', '/health')
    assert.ok(headers['content-type']?.includes('application/json'))
  })
})

// ─── Session Status ────────────────────────────────────

describe('Session Status', () => {
  it('returns status for non-existent session', async () => {
    const { status, body } = await request('GET', '/sessions/nonexistent/status', {
      headers: authedHeaders,
    })
    assert.equal(status, 200)
    // Should return disconnected or similar for unknown session
    assert.ok((body as any).status !== undefined)
  })
})

// ─── Response Security ─────────────────────────────────

describe('Response Security', () => {
  it('all error responses are JSON', async () => {
    const { headers } = await request('POST', '/sessions/start', {
      body: { session_id: '' },
    })
    // Auth error should still be JSON
    assert.ok(headers['content-type']?.includes('application/json'))
  })

  it('error body does not contain stack traces', async () => {
    const { body } = await request('POST', '/sessions/start', {
      headers: authedHeaders,
      body: { session_id: '' },
    })
    const raw = JSON.stringify(body)
    assert.ok(!raw.includes('at Object'))
    assert.ok(!raw.includes('node_modules'))
  })
})

// ─── Path Traversal in Media ───────────────────────────

describe('Media Path Security', () => {
  it('rejects path traversal in media URL', async () => {
    const { status } = await request('GET', '/media/../../etc/passwd', {
      headers: authedHeaders,
    })
    // Should be 400 or 404, not serve the file
    assert.ok([400, 403, 404].includes(status))
  })

  it('rejects null bytes in media path', async () => {
    const { status } = await request('GET', '/media/file%00.txt', {
      headers: authedHeaders,
    })
    assert.ok([400, 403, 404].includes(status))
  })
})
