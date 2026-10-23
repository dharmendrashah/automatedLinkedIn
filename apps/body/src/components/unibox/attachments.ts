import { type AttachmentKind } from './types'

const MB = 1024 * 1024

// What a reply may carry (.plan/unibox-send-attachments.md). Brain enforces the same numbers and the same types on what it receives
// (`packages/contracts/src/attachments.ts`); this copy is only for refusing early, so the two lists must be kept alike.
export const LIMITS = {
   // The largest file, of any kind.
   FILE_BYTES: 20 * MB,
   // How many attachments one message may carry.
   COUNT: 10,
   // The longest reply, in characters: what brain and the spider accept (the command that carries it is limited to 8 KB).
   TEXT: 4000,
} as const

// The types LinkedIn's composer takes, by extension; the audio types are an experiment LinkedIn may refuse.
const TYPES: Record<string, Exclude<AttachmentKind, 'LINK'>> = {
   png: 'IMAGE',
   jpg: 'IMAGE',
   jpeg: 'IMAGE',
   gif: 'IMAGE',
   webp: 'IMAGE',
   mp4: 'VIDEO',
   mov: 'VIDEO',
   mp3: 'AUDIO',
   m4a: 'AUDIO',
   wav: 'AUDIO',
   ai: 'FILE',
   psd: 'FILE',
   pdf: 'FILE',
   doc: 'FILE',
   docx: 'FILE',
   ppt: 'FILE',
   pptx: 'FILE',
   pps: 'FILE',
   ppsx: 'FILE',
   xls: 'FILE',
   xlsx: 'FILE',
   txt: 'FILE',
   eml: 'FILE',
}

const ACCEPT_BY_KIND = (kind: Exclude<AttachmentKind, 'LINK'>) =>
   Object.entries(TYPES)
      .filter(([, found]) => found === kind)
      .map(([extension]) => `.${extension}`)
      .join(',')

// What a picker is told to show for each kind.
export const ACCEPT = {
   IMAGE: ACCEPT_BY_KIND('IMAGE'),
   VIDEO: ACCEPT_BY_KIND('VIDEO'),
   AUDIO: ACCEPT_BY_KIND('AUDIO'),
   FILE: ACCEPT_BY_KIND('FILE'),
}

// The kind of a file by its name, or undefined when its type may not be sent.
export const sendableKind = (name: string) => TYPES[/\.([A-Za-z0-9]{1,8})$/.exec(name)?.[1]?.toLowerCase() ?? '']

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

const TYPES_SENTENCE =
   'LinkedIn takes images (PNG, JPG, GIF, WebP), documents (PDF, Word, PowerPoint, Excel, TXT, EML, AI, PSD), videos (MP4, MOV) and, as an experiment, audio (MP3, M4A, WAV).'

export const checkAttachment = (kind: AttachmentKind, bytes: number, alreadyThere: number, name?: string) => {
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

   if (kind !== 'LINK' && name !== undefined && !sendableKind(name)) {
      return {
         ok: false as const,
         reason: `This type of file cannot be sent. ${TYPES_SENTENCE}`,
      }
   }

   if (bytes > LIMITS.FILE_BYTES) {
      return {
         ok: false as const,
         reason: `A file can be up to ${formatBytes(LIMITS.FILE_BYTES)}.`,
      }
   }

   return { ok: true as const }
}
