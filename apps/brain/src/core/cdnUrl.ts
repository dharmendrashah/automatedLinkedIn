import { createHash } from 'node:crypto'
import { isIP } from 'node:net'

import { extensionOf } from '@automatedLinkedIn/contracts'

// Pure helpers of the public file cache (.plan/cdn-public-endpoint.md).

const MAX_URL_LENGTH = 2048
const MB = 1024 * 1024

const EXTENSIONS: Record<string, string> = {
   'image/jpeg': 'jpg',
   'image/png': 'png',
   'image/gif': 'gif',
   'image/webp': 'webp',
   'image/avif': 'avif',
   'image/bmp': 'bmp',
   'image/svg+xml': 'svg',
   'image/x-icon': 'ico',
   'image/vnd.microsoft.icon': 'ico',
   'video/mp4': 'mp4',
   'video/webm': 'webm',
   'video/quicktime': 'mov',
   'audio/mpeg': 'mp3',
   'audio/mp4': 'm4a',
   'audio/ogg': 'ogg',
   'audio/wav': 'wav',
   'application/pdf': 'pdf',
   'application/json': 'json',
   'text/plain': 'txt',
   'text/html': 'html',
   'text/css': 'css',
   'text/javascript': 'js',
   'application/javascript': 'js',
}

// The remote URL to cache, normalised (lowercase host, no trailing dot, no fragment), or null when it may not be fetched.
export const parseRemoteUrl = (raw: unknown): URL | null => {
   if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL_LENGTH || !URL.canParse(raw)) {
      return null
   }

   const url = new URL(raw)

   url.hash = ''
   url.hostname = url.hostname.replace(/\.$/, '')

   const host = url.hostname.replace(/^\[|\]$/g, '')
   const allowed =
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      url.port === '' &&
      isIP(host) === 0 &&
      host.includes('.') &&
      host !== 'localhost'

   return allowed ? url : null
}

export const urlHash = (url: URL) => createHash('md5').update(url.href).digest('hex')

// The bare media type of a Content-Type header, lowercase; empty when it is missing or malformed.
export const mediaType = (header: string | undefined) => {
   const type = (header ?? '').split(';')[0]?.trim().toLowerCase() ?? ''

   return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(type) ? type : ''
}

const isMedia = (type: string) => type.startsWith('video/') || type.startsWith('audio/')

export const sizeCap = (type: string) => (isMedia(type) ? 200 * MB : 25 * MB)

// How long one fetch may take once the answer started.
export const bodyTimeoutMs = (type: string) => (isMedia(type) ? 5 * 60_000 : 60_000)

// Only types a browser shows safely are served as themselves; anything else (pages, scripts, SVG) is a download.
export const servedAs = (type: string) => {
   const inline = (type.startsWith('image/') && type !== 'image/svg+xml') || isMedia(type) || type === 'application/pdf'

   return inline
      ? { contentType: type }
      : {
           contentType: 'application/octet-stream',
           contentDisposition: 'attachment',
        }
}

export const extensionFor = (url: URL, type: string) => EXTENSIONS[type] ?? extensionOf(url.pathname) ?? 'bin'

const pad = (value: number) => String(value).padStart(2, '0')

export const objectKey = (url: URL, type: string, hash: string, now = new Date()) => {
   const extension = extensionFor(url, type)
   const day = `${now.getUTCFullYear()}/${pad(now.getUTCMonth() + 1)}/${pad(now.getUTCDate())}`

   return `cache/${url.hostname}/${extension}/${day}/${hash}.${extension}`
}

export const bucketUrlOf = (bucket: string, key: string) => `gs://${bucket}/${key}`

export const publicUrlOf = (bucketUrl: string) => bucketUrl.replace(/^gs:\/\//, 'https://storage.googleapis.com/')
