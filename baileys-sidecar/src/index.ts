import crypto from 'crypto'
import express from 'express'
import { SessionManager } from './session-manager.js'
import { logger } from './logger.js'
import { getMediaDir, cleanupOldMedia } from './message-utils.js'

const app = express()
app.use(express.json({ limit: '10mb' }))

// Serve downloaded media files so Nexus can fetch them
app.use('/media', express.static(getMediaDir()))

const API_KEY = process.env.BAILEYS_SIDECAR_API_KEY || 'nexus-internal-baileys'
const PORT = parseInt(process.env.PORT || '3500', 10)
const NEXUS_WEBHOOK_URL = process.env.NEXUS_WEBHOOK_URL || 'http://localhost:3000'

// Input validation helpers
const SESSION_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/
const JID_RE = /^[0-9]+@(s\.whatsapp\.net|g\.us|lid)$/

function isValidSessionId(id: unknown): id is string {
  return typeof id === 'string' && SESSION_ID_RE.test(id)
}

function isValidJid(jid: unknown): jid is string {
  return typeof jid === 'string' && JID_RE.test(jid)
}

function isValidSlug(slug: unknown): slug is string {
  return typeof slug === 'string' && SLUG_RE.test(slug)
}

// Simple in-memory rate limiter (per IP, 60 RPM for session starts, 300 RPM for messages)
const rateBuckets = new Map<string, number[]>()

function isRateLimited(ip: string, limit: number): boolean {
  const now = Date.now()
  const bucket = rateBuckets.get(ip) ?? []
  const recent = bucket.filter(t => now - t < 60_000)
  if (recent.length >= limit) {
    rateBuckets.set(ip, recent)
    return true
  }
  recent.push(now)
  rateBuckets.set(ip, recent)
  return false
}

// Clean up stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [ip, bucket] of rateBuckets) {
    const recent = bucket.filter(t => now - t < 60_000)
    if (recent.length === 0) rateBuckets.delete(ip)
    else rateBuckets.set(ip, recent)
  }
}, 5 * 60 * 1000)

// API key auth middleware — timing-safe comparison
function authenticate(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const provided = req.headers['x-api-key']
  if (typeof provided !== 'string' || provided.length !== API_KEY.length) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  if (!crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(API_KEY))) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
}

const manager = new SessionManager(NEXUS_WEBHOOK_URL, API_KEY)

// Health check — registered BEFORE auth middleware so Docker healthcheck works
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', sessions: manager.getActiveSessions() })
})

app.use(authenticate)

// Start a session (generates QR code)
app.post('/sessions/start', async (req, res) => {
  const { session_id, client_slug, force, sync_full_history, import_groups } = req.body
  if (!isValidSessionId(session_id)) {
    res.status(400).json({ error: 'session_id is required (alphanumeric, max 128 chars)' })
    return
  }
  if (client_slug !== undefined && !isValidSlug(client_slug)) {
    res.status(400).json({ error: 'client_slug must be lowercase alphanumeric with hyphens, max 63 chars' })
    return
  }
  const ip = req.ip || 'unknown'
  if (isRateLimited(`session:${ip}`, 60)) {
    res.status(429).json({ error: 'Rate limit exceeded' })
    return
  }

  try {
    const result = await manager.startSession(session_id, client_slug, {
      force: force === true,
      syncFullHistory: sync_full_history !== false,
      importGroups: import_groups === true,
    })
    res.json(result)
  } catch (err: any) {
    logger.error({ err, session_id, client_slug }, 'Failed to start session')
    res.status(500).json({ error: err.message })
  }
})

// Get session status
app.get('/sessions/:session_id/status', (req, res) => {
  const { session_id } = req.params
  const client_slug = req.query.client_slug as string | undefined
  const status = manager.getSessionStatus(session_id, client_slug)
  res.json({ session_id, status })
})

// Disconnect a session
app.post('/sessions/disconnect', async (req, res) => {
  const { session_id, client_slug } = req.body
  if (!isValidSessionId(session_id)) {
    res.status(400).json({ error: 'session_id is required (alphanumeric, max 128 chars)' })
    return
  }
  if (client_slug !== undefined && !isValidSlug(client_slug)) {
    res.status(400).json({ error: 'client_slug must be lowercase alphanumeric with hyphens, max 63 chars' })
    return
  }

  try {
    await manager.disconnectSession(session_id, client_slug)
    res.json({ status: 'disconnected' })
  } catch (err: any) {
    logger.error({ err, session_id, client_slug }, 'Failed to disconnect session')
    res.status(500).json({ error: err.message })
  }
})

// Send a message
app.post('/messages/send', async (req, res) => {
  const { session_id, jid, message, quoted_message_id, client_slug } = req.body
  if (!isValidSessionId(session_id) || !isValidJid(jid) || !message || typeof message !== 'object') {
    res.status(400).json({ error: 'session_id (alphanumeric), jid (valid WhatsApp JID), and message (object) are required' })
    return
  }
  if (client_slug !== undefined && !isValidSlug(client_slug)) {
    res.status(400).json({ error: 'client_slug must be lowercase alphanumeric with hyphens, max 63 chars' })
    return
  }
  const ip = req.ip || 'unknown'
  if (isRateLimited(`msg:${ip}`, 300)) {
    res.status(429).json({ error: 'Rate limit exceeded' })
    return
  }

  try {
    const result = await manager.sendMessage(session_id, jid, message, quoted_message_id, client_slug)
    res.json(result)
  } catch (err: any) {
    logger.error({ err, session_id, jid, client_slug }, 'Failed to send message')
    res.status(500).json({ error: err.message })
  }
})

app.listen(PORT, '0.0.0.0', async () => {
  logger.info({ port: PORT, nexus: NEXUS_WEBHOOK_URL }, 'Baileys sidecar started')

  // Clean up expired media files every 5 minutes
  setInterval(cleanupOldMedia, 5 * 60 * 1000)

  // Restore previously authenticated sessions
  await manager.restoreSessions()
})
