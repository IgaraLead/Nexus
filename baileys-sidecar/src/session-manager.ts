import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  type WASocket,
  type WAMessageContent,
  type proto,
  type Contact,
} from '@whiskeysockets/baileys'
import { readdir, rm } from 'fs/promises'
import { existsSync } from 'fs'
import { Boom } from '@hapi/boom'
import NodeCache from '@cacheable/node-cache'
import type { CacheStore } from '@whiskeysockets/baileys'
import * as QRCode from 'qrcode'
import { logger } from './logger.js'
import {
  detectMessageType,
  extractContent,
  extractQuotedId,
  downloadAndSaveMedia,
  isMediaType,
  getMediaPlaceholder,
} from './message-utils.js'

interface SessionEntry {
  socket: WASocket | null
  status: 'disconnected' | 'connecting' | 'qr_pending' | 'connected'
  qr: string | null
  qrDataUrl: string | null
  phoneNumber: string | null
  retryCount: number
  syncFullHistory: boolean
  importGroups: boolean
}

const MAX_RETRIES = 3
const SESSIONS_DIR = process.env.SESSIONS_DIR || './sessions'

export class SessionManager {
  private sessions = new Map<string, SessionEntry>()
  private nexusWebhookUrl: string
  private apiKey: string
  private msgRetryCounterCache = new NodeCache() as CacheStore

  constructor(nexusWebhookUrl: string, apiKey: string) {
    this.nexusWebhookUrl = nexusWebhookUrl
    this.apiKey = apiKey
  }

  async restoreSessions(): Promise<void> {
    // Wait for Rails to be ready before restoring sessions
    await this.waitForRails()

    try {
      const topDirs = await readdir(SESSIONS_DIR, { withFileTypes: true })
      const slugDirs = topDirs.filter(d => d.isDirectory())
      if (!slugDirs.length) {
        logger.info('No saved sessions to restore')
        return
      }

      for (const slugDir of slugDirs) {
        const slugPath = `${SESSIONS_DIR}/${slugDir.name}`
        // Check if this is a slug directory (contains subdirectories) or a legacy flat session
        const children = await readdir(slugPath, { withFileTypes: true }).catch(() => [])
        const hasSubDirs = children.some(c => c.isDirectory())

        if (hasSubDirs) {
          // Slug-scoped sessions: /sessions/{slug}/{sessionId}/
          const sessionIds = children.filter(c => c.isDirectory()).map(c => c.name)
          logger.info({ slug: slugDir.name, count: sessionIds.length }, 'Restoring slug-scoped sessions')
          for (const sessionId of sessionIds) {
            await this.restoreOneSession(sessionId, slugDir.name)
          }
        } else {
          // Legacy flat session: /sessions/{sessionId}/ (no slug)
          logger.info({ sessionId: slugDir.name }, 'Restoring legacy session (no slug)')
          await this.restoreOneSession(slugDir.name)
        }
      }
    } catch {
      logger.info('No sessions directory to restore from')
    }
  }

  private async restoreOneSession(sessionId: string, clientSlug?: string): Promise<void> {
    const label = clientSlug ? `${clientSlug}/${sessionId}` : sessionId
    try {
      const result = await this.startSession(sessionId, clientSlug)

      if (result.status === 'connected') {
        logger.info({ sessionId, clientSlug }, 'Session restored')
      } else {
        logger.warn({ sessionId, clientSlug, status: result.status }, 'Stale session removed during restore')
        await this.cleanupSession(sessionId, clientSlug)
      }
    } catch (err) {
      logger.warn({ err, sessionId, clientSlug }, 'Failed to restore session, cleaning up')
      await this.cleanupSession(sessionId, clientSlug)
    }
  }

  private sessionPath(sessionId: string, clientSlug?: string): string {
    if (clientSlug) {
      return `${SESSIONS_DIR}/${clientSlug}/${sessionId}`
    }
    return `${SESSIONS_DIR}/${sessionId}`
  }

  private sessionKey(sessionId: string, clientSlug?: string): string {
    return clientSlug ? `${clientSlug}:${sessionId}` : sessionId
  }

  private async cleanupSession(sessionId: string, clientSlug?: string): Promise<void> {
    const key = this.sessionKey(sessionId, clientSlug)
    const entry = this.sessions.get(key)
    if (entry?.socket) {
      try { entry.socket.end(undefined) } catch { /* ignore */ }
    }
    this.sessions.delete(key)
    const sessionDir = this.sessionPath(sessionId, clientSlug)
    await rm(sessionDir, { recursive: true, force: true }).catch(() => {})
  }

  private async waitForRails(): Promise<void> {
    const healthUrl = `${this.nexusWebhookUrl}/health`
    const maxWait = 240_000 // 4 minutes
    const interval = 3_000
    const start = Date.now()

    logger.info('Waiting for Rails to be ready...')
    while (Date.now() - start < maxWait) {
      try {
        const res = await fetch(healthUrl, { method: 'HEAD' })
        if (res.status < 500) {
          logger.info('Rails is ready')
          return
        }
      } catch { /* not ready yet */ }
      await this.sleep(interval)
    }
    logger.warn('Rails readiness check timed out, proceeding anyway')
  }

  getActiveSessions(): string[] {
    return Array.from(this.sessions.entries())
      .filter(([, s]) => s.status === 'connected')
      .map(([id]) => id)
  }

  getSessionStatus(sessionId: string, clientSlug?: string): string {
    const key = this.sessionKey(sessionId, clientSlug)
    return this.sessions.get(key)?.status || 'disconnected'
  }

  async startSession(
    sessionId: string,
    clientSlug?: string,
    options?: { force?: boolean; syncFullHistory?: boolean; importGroups?: boolean }
  ): Promise<{ session_id: string; status: string; qr?: string }> {
    const key = this.sessionKey(sessionId, clientSlug)
    const force = options?.force === true
    const syncFullHistory = options?.syncFullHistory !== false
    const importGroups = options?.importGroups === true
    const existing = this.sessions.get(key)
    if (!force && existing?.status === 'connected') {
      return { session_id: sessionId, status: 'connected' }
    }

    // Close existing socket if any
    if (existing?.socket) {
      try { existing.socket.end(undefined) } catch { /* ignore */ }
    }

    const entry: SessionEntry = {
      socket: null,
      status: 'connecting',
      qr: null,
      qrDataUrl: null,
      phoneNumber: null,
      retryCount: 0,
      syncFullHistory,
      importGroups,
    }
    this.sessions.set(key, entry)

    await this.connect(sessionId, entry, clientSlug)

    // Wait briefly for QR to be generated
    await this.waitForQR(key, 8000)

    // Session may have been removed during connect (e.g. logged out)
    const updated = this.sessions.get(key)
    if (!updated) {
      return { session_id: sessionId, status: 'disconnected' }
    }
    const result: { session_id: string; status: string; qr?: string } = {
      session_id: sessionId,
      status: updated.status,
    }
    if (updated.qrDataUrl) {
      result.qr = updated.qrDataUrl
    }
    return result
  }

  async disconnectSession(sessionId: string, clientSlug?: string): Promise<void> {
    const key = this.sessionKey(sessionId, clientSlug)
    const entry = this.sessions.get(key)
    if (entry?.socket) {
      try { await entry.socket.logout() } catch { /* ignore */ }
      try { entry.socket.end(undefined) } catch { /* ignore */ }
    }
    this.sessions.delete(key)
    logger.info({ sessionId, clientSlug }, 'Session disconnected')
  }

  async sendMessage(
    sessionId: string,
    jid: string,
    message: Record<string, any>,
    quotedMessageId?: string,
    clientSlug?: string
  ): Promise<{ key: proto.IMessageKey } | null> {
    const key = this.sessionKey(sessionId, clientSlug)
    const entry = this.sessions.get(key)
    if (!entry?.socket || entry.status !== 'connected') {
      throw new Error(`Session ${sessionId} is not connected`)
    }

    let content: WAMessageContent = {}

    if (message.text) {
      content = { text: message.text } as any
    } else if (message.image) {
      content = { image: { url: message.image.url }, caption: message.caption || undefined } as any
    } else if (message.video) {
      content = { video: { url: message.video.url }, caption: message.caption || undefined } as any
    } else if (message.audio) {
      content = { audio: { url: message.audio.url }, mimetype: 'audio/ogg; codecs=opus' } as any
    } else if (message.document) {
      content = { document: { url: message.document.url }, mimetype: message.mimetype || 'application/octet-stream' } as any
    }

    const options: any = {}
    if (quotedMessageId) {
      options.quoted = { key: { id: quotedMessageId } }
    }

    const result = await entry.socket.sendMessage(jid, content as any, options)
    return result || null
  }

  // --- Private ---

  private async connect(sessionId: string, entry: SessionEntry, clientSlug?: string): Promise<void> {
    const sessPath = this.sessionPath(sessionId, clientSlug)
    const key = this.sessionKey(sessionId, clientSlug)
    const { state, saveCreds } = await useMultiFileAuthState(sessPath)
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
      version,
      logger: logger.child({ session: sessionId }) as any,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger as any),
      },
      msgRetryCounterCache: this.msgRetryCounterCache,
      generateHighQualityLinkPreview: true,
      syncFullHistory: entry.syncFullHistory,
      fireInitQueries: true,
      markOnlineOnConnect: false,
      shouldSyncHistoryMessage: () => entry.syncFullHistory,
      getMessage: async (key) => {
        return { conversation: '' }
      },
    })

    entry.socket = sock

    sock.ev.process(async (events) => {
      if (events['connection.update']) {
        await this.handleConnectionUpdate(key, sessionId, events['connection.update'], clientSlug)
      }

      if (events['creds.update']) {
        await saveCreds()
      }

      if (events['messages.upsert']) {
        await this.handleMessagesUpsert(sessionId, events['messages.upsert'], sock)
      }

      if (events['messages.update']) {
        await this.handleMessagesUpdate(sessionId, events['messages.update'])
      }

      if (events['contacts.upsert']) {
        await this.handleContactsUpsert(sessionId, events['contacts.upsert'], sock)
      }

      if (events['contacts.update']) {
        await this.handleContactsUpdate(sessionId, events['contacts.update'], sock)
      }

      if (events['groups.update']) {
        await this.handleGroupsUpdate(sessionId, events['groups.update'], sock)
      }
    })
  }

  private async handleConnectionUpdate(key: string, sessionId: string, update: any, clientSlug?: string): Promise<void> {
    const entry = this.sessions.get(key)
    if (!entry) return

    const { connection, lastDisconnect, qr } = update

    if (qr) {
      entry.status = 'qr_pending'
      entry.qr = qr
      try {
        entry.qrDataUrl = await QRCode.toDataURL(qr)
      } catch {
        entry.qrDataUrl = qr
      }
      logger.info({ sessionId }, 'QR code generated')

      // Notify Nexus about QR
      await this.webhookPost('/webhooks/baileys/qr', {
        session_id: sessionId,
        qr: entry.qrDataUrl,
      })
    }

    if (connection === 'open') {
      const phoneNumber = entry.socket?.user?.id?.split(':')[0] || null
      entry.status = 'connected'
      entry.phoneNumber = phoneNumber
      entry.qr = null
      entry.qrDataUrl = null
      entry.retryCount = 0
      logger.info({ sessionId, phoneNumber }, 'Session connected')

      await this.webhookPost('/webhooks/baileys/connection', {
        session_id: sessionId,
        connection: 'open',
        phone_number: phoneNumber,
      })

      // Sync group metadata only when explicitly enabled
      if (entry.socket && entry.importGroups) {
        setTimeout(() => this.syncGroups(sessionId, entry.socket!), 5000)
      }
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
      const loggedOut = statusCode === DisconnectReason.loggedOut

      if (loggedOut) {
        entry.status = 'disconnected'
        entry.socket = null
        this.sessions.delete(key)
        logger.info({ sessionId, clientSlug }, 'Session logged out')

        // Clean up auth state for logged-out sessions
        const sessPath = this.sessionPath(sessionId, clientSlug)
        rm(sessPath, { recursive: true, force: true }).catch(() => {})

        await this.webhookPost('/webhooks/baileys/connection', {
          session_id: sessionId,
          connection: 'close',
        })
      } else if (entry.retryCount < MAX_RETRIES) {
        entry.retryCount++
        entry.status = 'connecting'
        logger.info({ sessionId, clientSlug, retry: entry.retryCount }, 'Reconnecting...')
        // Reconnect after a short delay
        setTimeout(() => this.connect(sessionId, entry, clientSlug), 2000)
      } else {
        entry.status = 'disconnected'
        entry.socket = null
        logger.warn({ sessionId }, 'Max retries reached, giving up')

        await this.webhookPost('/webhooks/baileys/connection', {
          session_id: sessionId,
          connection: 'close',
        })
      }
    }
  }

  private async handleMessagesUpsert(sessionId: string, data: any, sock: WASocket): Promise<void> {
    const { messages, type } = data
    const isHistory = type === 'append'

    if (type !== 'notify' && type !== 'append') return
    const sortedMessages = isHistory
      ? [...messages].sort(
          (a, b) => normalizeTimestamp(a.messageTimestamp) - normalizeTimestamp(b.messageTimestamp)
        )
      : messages

    for (const msg of sortedMessages) {
      if (isHistory && msg.key?.remoteJid?.endsWith('@g.us')) continue
      await this.processMessage(sessionId, msg, isHistory, sock)
    }
  }

  private async processMessage(sessionId: string, msg: any, isHistory: boolean, sock: WASocket): Promise<void> {
    if (msg.key.remoteJid === 'status@broadcast') return
    if (msg.key.remoteJid?.endsWith('@newsletter')) return
    if (!msg.message) return

    // Do not drop fromMe realtime events here.
    // Rails deduplicates by source_id and this keeps messages sent directly in WhatsApp
    // (outside Nexus UI) visible in inbox timelines.

    const { type: msgType, isViewOnce } = detectMessageType(msg.message)

    // Skip protocol/system messages
    if (msgType === 'protocolMessage' || msgType === 'senderKeyDistributionMessage' || msgType === 'unknown') return

    let content = extractContent(msg.message, msgType)

    // Download media if present
    let media: { path: string; mimetype: string; filename: string } | null = null
    if (isMediaType(msgType)) {
      media = await downloadAndSaveMedia(msg, msgType, sock)
      // Keep the message visible even when media download fails.
      if (!media) {
        content = getMediaPlaceholder(msgType)
      }
    }

    // Skip empty messages (no content and no media)
    if (!content && !media) return

    // Normalize LID-addressed keys to phone-based JIDs
    const normalizedKey = this.normalizeKey(msg.key)

    const payload: Record<string, any> = {
      session_id: sessionId,
      key: normalizedKey,
      content,
      message_type: msgType,
      pushName: msg.pushName,
      messageTimestamp: normalizeTimestamp(msg.messageTimestamp),
      is_history: isHistory,
      is_view_once: isViewOnce,
      quoted_message_id: extractQuotedId(msg.message, msgType),
      is_gif: msgType === 'videoMessage' && Boolean((msg.message as any)?.videoMessage?.gifPlayback),
    }

    if (media) {
      payload.media_path = media.path
      payload.media_mimetype = media.mimetype
      payload.media_filename = media.filename
    }

    await this.webhookPost('/webhooks/baileys/message', payload)
  }

  private async handleContactsUpsert(sessionId: string, contacts: Contact[], sock: WASocket): Promise<void> {
    const filtered = contacts.filter(c => c.id?.endsWith('@s.whatsapp.net'))
    if (!filtered.length) return

    logger.info({ sessionId, count: filtered.length }, 'Contacts upsert received')
    for (const contact of filtered) {
      const avatarUrl = await this.fetchProfilePicture(sock, contact.id!)
      await this.webhookPost('/webhooks/baileys/contact', {
        session_id: sessionId,
        jid: contact.id,
        name: contact.name || contact.notify || '',
        notify: contact.notify || '',
        phone_number: contact.id.split('@')[0],
        avatar_url: avatarUrl,
      })
    }
  }

  private async handleContactsUpdate(sessionId: string, updates: Partial<Contact>[], sock: WASocket): Promise<void> {
    const filtered = updates.filter(c => c.id?.endsWith('@s.whatsapp.net'))
    if (!filtered.length) return

    logger.info({ sessionId, count: filtered.length }, 'Contacts update received')
    for (const contact of filtered) {
      const avatarUrl = await this.fetchProfilePicture(sock, contact.id!)
      await this.webhookPost('/webhooks/baileys/contact', {
        session_id: sessionId,
        jid: contact.id,
        name: contact.name || contact.notify || '',
        notify: contact.notify || '',
        phone_number: contact.id!.split('@')[0],
        avatar_url: avatarUrl,
      })
    }
  }

  private async handleGroupsUpdate(_sessionId: string, _updates: any[], _sock: WASocket): Promise<void> {
    // Groups are intentionally ignored for now to avoid creating unsupported contacts in Nexus.
  }

  private async handleMessagesUpdate(sessionId: string, updates: any[]): Promise<void> {
    for (const update of updates) {
      if (!update.update?.status) continue

      // Skip group message status updates
      if (update.key?.remoteJid?.endsWith('@g.us')) continue

      const statusMap: Record<number, string> = {
        2: 'sent',
        3: 'delivered',
        4: 'read',
        5: 'read', // PLAYED (audio/video) — treat as read since Chatwoot has no 'played' status
      }

      const status = statusMap[update.update.status]
      if (!status) continue

      logger.info({ sessionId, messageId: update.key?.id, status }, 'Message status update')

      await this.webhookPost('/webhooks/baileys/status', {
        session_id: sessionId,
        key: update.key,
        status,
      })
    }
  }

  /**
   * Normalize LID-addressed message keys to phone-based JIDs.
   * WhatsApp uses two addressing modes: "pn" (phone number, @s.whatsapp.net)
   * and "lid" (Linked Identity, @lid). When addressingMode is "lid",
   * remoteJidAlt has the phone-based JID and participantAlt has the phone participant.
   */
  private normalizeKey(key: any): any {
    const normalized = { ...key }

    // For 1:1 chats: prefer phone-based JID
    if (normalized.remoteJid?.endsWith('@lid') && normalized.remoteJidAlt?.endsWith('@s.whatsapp.net')) {
      normalized.remoteJid = normalized.remoteJidAlt
    }

    // For group messages: prefer phone-based participant
    if (normalized.participant?.endsWith('@lid') && normalized.participantAlt?.endsWith('@s.whatsapp.net')) {
      normalized.participant = normalized.participantAlt
    }

    return normalized
  }

  /**
   * Fetch group metadata and send to Nexus for proper group naming.
   */
  private async syncGroups(sessionId: string, sock: WASocket): Promise<void> {
    try {
      const groups = await sock.groupFetchAllParticipating()
      const entries = Object.values(groups)
      if (!entries.length) return

      logger.info({ sessionId, count: entries.length }, 'Syncing group metadata')
      for (const group of entries) {
        let avatarUrl: string | undefined
        try {
          avatarUrl = await sock.profilePictureUrl(group.id, 'preview')
        } catch { /* no picture */ }

        await this.webhookPost('/webhooks/baileys/group', {
          session_id: sessionId,
          jid: group.id,
          name: group.subject,
          description: group.desc || '',
          participant_count: group.participants?.length || 0,
          avatar_url: avatarUrl || null,
        })
      }
    } catch (err) {
      logger.warn({ err, sessionId }, 'Failed to sync groups')
    }
  }

  /**
   * Fetch profile picture URL for a contact.
   */
  private async fetchProfilePicture(sock: WASocket, jid: string): Promise<string | null> {
    try {
      return await sock.profilePictureUrl(jid, 'preview') || null
    } catch {
      return null
    }
  }

  private async webhookPost(path: string, body: Record<string, any>): Promise<void> {
    const url = `${this.nexusWebhookUrl}${path}`
    const maxRetries = 3

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': this.apiKey,
          },
          body: JSON.stringify(body),
        })
        if (res.ok) return

        if (res.status >= 500 && attempt < maxRetries) {
          logger.warn({ url, status: res.status, attempt }, 'Webhook server error, retrying...')
          await this.sleep(1000 * attempt)
          continue
        }

        logger.warn({ url, status: res.status }, 'Webhook request failed')
        return
      } catch (err) {
        if (attempt < maxRetries) {
          logger.warn({ err, url, attempt }, 'Webhook error, retrying...')
          await this.sleep(1000 * attempt)
          continue
        }
        logger.error({ err, url }, 'Webhook request error after retries')
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private waitForQR(sessionId: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const start = Date.now()
      const check = () => {
        const entry = this.sessions.get(sessionId)
        if (!entry || entry.qrDataUrl || entry.status === 'connected' || Date.now() - start > timeoutMs) {
          resolve()
          return
        }
        setTimeout(check, 300)
      }
      check()
    })
  }
}

function normalizeTimestamp(ts: any): number {
  if (typeof ts === 'number') return ts
  if (typeof ts === 'object' && ts !== null && 'low' in ts) return ts.low as number
  if (typeof ts === 'string') return parseInt(ts, 10) || 0
  return 0
}
