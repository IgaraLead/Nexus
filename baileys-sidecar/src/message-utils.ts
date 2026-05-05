import { downloadMediaMessage, getContentType, type WASocket, type WAMessage, type proto } from '@whiskeysockets/baileys'
import { writeFile, mkdir, readdir, unlink, stat } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { logger } from './logger.js'

const MEDIA_DIR = process.env.MEDIA_DIR || '/tmp/baileys-media'
const MEDIA_TTL_MS = 10 * 60 * 1000 // 10 minutes

// Initialize media directory (fire-and-forget)
mkdir(MEDIA_DIR, { recursive: true }).catch(() => {})

const MEDIA_TYPES = new Set([
  'imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage',
])

const MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/3gpp': '.3gp',
  'audio/ogg; codecs=opus': '.ogg',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'application/pdf': '.pdf',
}

function unwrapMessage(message: proto.IMessage): { inner: proto.IMessage; isViewOnce: boolean } {
  if (message.viewOnceMessage?.message) {
    return { inner: message.viewOnceMessage.message, isViewOnce: true }
  }
  if (message.viewOnceMessageV2?.message) {
    return { inner: message.viewOnceMessageV2.message, isViewOnce: true }
  }
  return { inner: message, isViewOnce: false }
}

export function detectMessageType(message: proto.IMessage): { type: string; isViewOnce: boolean } {
  const { inner, isViewOnce } = unwrapMessage(message)
  const type = getContentType(inner) || 'unknown'
  return { type, isViewOnce }
}

export function isMediaType(msgType: string): boolean {
  return MEDIA_TYPES.has(msgType)
}

export function getMediaPlaceholder(msgType: string): string {
  const placeholders: Record<string, string> = {
    imageMessage: '_<Image>_',
    videoMessage: '_<Video/GIF>_',
    audioMessage: '_<Audio>_',
    documentMessage: '_<Document>_',
    stickerMessage: '_<Sticker>_',
  }
  return placeholders[msgType] || '_<Media>_'
}

export function extractContent(message: proto.IMessage, msgType: string): string {
  const { inner } = unwrapMessage(message)

  switch (msgType) {
    case 'conversation':
      return inner.conversation || ''

    case 'extendedTextMessage':
      return inner.extendedTextMessage?.text || ''

    case 'imageMessage':
      return inner.imageMessage?.caption || ''

    case 'videoMessage':
      return inner.videoMessage?.caption || ''

    case 'documentMessage':
      return inner.documentMessage?.caption || ''

    case 'audioMessage':
      return '_<Audio>_'

    case 'stickerMessage':
      return '_<Sticker>_'

    case 'locationMessage': {
      const loc = inner.locationMessage
      if (!loc) return ''
      const parts: string[] = []
      if (loc.name) parts.push(`*${loc.name}*`)
      if (loc.address) parts.push(loc.address)
      parts.push(`📍 https://www.google.com/maps?q=${loc.degreesLatitude},${loc.degreesLongitude}`)
      return parts.join('\n')
    }

    case 'liveLocationMessage': {
      const live = inner.liveLocationMessage
      if (!live) return ''
      return `📍 https://www.google.com/maps?q=${live.degreesLatitude},${live.degreesLongitude}`
    }

    case 'contactMessage': {
      const c = inner.contactMessage
      if (!c) return ''
      return formatVCard(c.displayName || '', c.vcard || '')
    }

    case 'contactsArrayMessage': {
      const contacts = inner.contactsArrayMessage?.contacts
      if (!contacts?.length) return ''
      return contacts.map(c => formatVCard(c.displayName || '', c.vcard || '')).join('\n\n')
    }

    case 'listResponseMessage':
      return inner.listResponseMessage?.title || inner.listResponseMessage?.singleSelectReply?.selectedRowId || ''

    case 'buttonsResponseMessage':
      return inner.buttonsResponseMessage?.selectedDisplayText || ''

    case 'templateButtonReplyMessage':
      return inner.templateButtonReplyMessage?.selectedDisplayText || ''

    case 'reactionMessage':
      return inner.reactionMessage?.text
        ? `Reacted with ${inner.reactionMessage.text}`
        : '_<Reaction>_'

    default:
      return ''
  }
}

function formatVCard(name: string, vcard: string): string {
  const phones: string[] = []
  const re = /TEL[^:]*:([^\n\r]+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(vcard)) !== null) {
    phones.push(m[1].trim())
  }
  const phonePart = phones.length ? ` (${phones.join(', ')})` : ''
  return `👤 ${name}${phonePart}`
}

export function extractQuotedId(message: proto.IMessage, msgType: string): string | undefined {
  const { inner } = unwrapMessage(message)
  const msg = (inner as any)[msgType]
  return msg?.contextInfo?.stanzaId || undefined
}

export async function downloadAndSaveMedia(
  fullMsg: proto.IWebMessageInfo,
  msgType: string,
  sock: WASocket
): Promise<{ path: string; mimetype: string; filename: string } | null> {
  if (!MEDIA_TYPES.has(msgType)) return null

  const { inner } = unwrapMessage(fullMsg.message!)
  const mediaMsg = (inner as any)[msgType]
  if (!mediaMsg) return null
  if (!mediaMsg.mediaKey) return null

  try {
    const buffer = await downloadMediaMessage(fullMsg as WAMessage, 'buffer', {}, {
      logger: logger as any,
      reuploadRequest: sock.updateMediaMessage,
    })

    const mimetype: string = mediaMsg.mimetype || 'application/octet-stream'
    const ext = MIME_EXT[mimetype] || '.bin'
    const originalFilename: string = mediaMsg.fileName || `${msgType.replace('Message', '')}${ext}`
    const uniqueName = `${randomUUID()}${ext}`
    const filePath = join(MEDIA_DIR, uniqueName)

    await writeFile(filePath, buffer as Buffer)

    return { path: `/media/${uniqueName}`, mimetype, filename: originalFilename }
  } catch (err) {
    logger.error({ err, msgType }, 'Failed to download media')
    return null
  }
}

export async function cleanupOldMedia(): Promise<void> {
  try {
    const files = await readdir(MEDIA_DIR)
    const now = Date.now()
    for (const file of files) {
      try {
        const filePath = join(MEDIA_DIR, file)
        const s = await stat(filePath)
        if (now - s.mtimeMs > MEDIA_TTL_MS) {
          await unlink(filePath)
        }
      } catch { /* ignore individual file errors */ }
    }
  } catch { /* dir might not exist yet */ }
}

export function getMediaDir(): string {
  return MEDIA_DIR
}
