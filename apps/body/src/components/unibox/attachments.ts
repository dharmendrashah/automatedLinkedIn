import { type AttachmentKind } from './types'

const MB = 1024 * 1024

// What a reply may carry. These numbers are guesses, not LinkedIn's (unverified: .plan/unibox.md), and only the interface uses them.
export const LIMITS = {
   IMAGE: 10 * MB,
   VIDEO: 200 * MB,
   AUDIO: 20 * MB,
   FILE: 20 * MB,
   // How many attachments one message may carry.
   COUNT: 10,
   // The longest reply, in characters (unverified).
   TEXT: 8000,
} as const

export const formatBytes = (bytes: number) => {
   if (bytes < 1024) {
      return `${bytes} B`
   }

   const [size, unit] = bytes < MB ? [bytes / 1024, 'KB'] : [bytes / MB, 'MB']

   return `${Number(size.toFixed(1))} ${unit}`
}

// Pictures a browser can show; a vector picture can carry script, so it goes as a plain file.
const SHOWN_IMAGES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

export const kindOfFile = ({ type }: { type: string; name: string }): AttachmentKind => {
   if (SHOWN_IMAGES.has(type)) {
      return 'IMAGE'
   }

   if (type.startsWith('video/')) {
      return 'VIDEO'
   }

   if (type.startsWith('audio/')) {
      return 'AUDIO'
   }

   return 'FILE'
}

const NAMES: Record<'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE', string> = {
   IMAGE: 'An image',
   VIDEO: 'A video',
   AUDIO: 'An audio file',
   FILE: 'A file',
}

export const checkAttachment = (kind: AttachmentKind, bytes: number, alreadyThere: number) => {
   if (alreadyThere >= LIMITS.COUNT) {
      return {
         ok: false as const,
         reason: `A message can carry up to ${LIMITS.COUNT} attachments.`,
      }
   }

   if (bytes <= 0) {
      return {
         ok: false as const,
         reason: 'The file is empty.',
      }
   }

   const key = kind === 'LINK' ? 'FILE' : kind

   if (bytes > LIMITS[key]) {
      return {
         ok: false as const,
         reason: `${NAMES[key]} can be up to ${formatBytes(LIMITS[key])}.`,
      }
   }

   return { ok: true as const }
}
