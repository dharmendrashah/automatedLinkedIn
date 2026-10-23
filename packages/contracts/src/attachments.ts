import { createHash } from 'node:crypto'
import { z } from 'zod'

// What a reply may carry (.plan/unibox-send-attachments.md). Brain enforces these on what it reads, the spider on what it is
// given, and the page uses the same numbers to refuse early.
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
// Per message; LinkedIn's own limit is not verified.
export const MAX_ATTACHMENTS = 10

export const ATTACHMENT_KINDS = ['IMAGE', 'VIDEO', 'AUDIO', 'FILE'] as const
export type SendableKind = (typeof ATTACHMENT_KINDS)[number]

// The types LinkedIn's composer lists in its file inputs (recorded 2026-10-22): images; ai, psd, pdf, doc, docx, ppt, pptx, pps,
// ppsx, xls, xlsx, txt, eml; and mov and mp4 for video. The audio types are an experiment the owner asked for: the composer does
// not list them, so LinkedIn may refuse them.
const TYPES: Record<string, SendableKind> = {
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

export const ATTACHMENT_EXTENSIONS = Object.keys(TYPES)

export const extensionOf = (name: string) => /\.([A-Za-z0-9]{1,8})$/.exec(name)?.[1]?.toLowerCase()

// The kind of a file by its name, or undefined when its type may not be sent.
export const kindOfName = (name: string): SendableKind | undefined => {
   const extension = extensionOf(name)

   return extension === undefined ? undefined : TYPES[extension]
}

// A file name that is safe to keep and to type into a path: no folders, no control characters, no leading dot, at most 120 characters.
export const safeFileName = (name: string) => {
   const base = name.split(/[\\/]/).pop() ?? ''
   const clean = Array.from(base)
      .filter(character => {
         const code = character.charCodeAt(0)

         return code > 31 && code !== 127 && !'<>:"|?*'.includes(character)
      })
      .join('')
      .replace(/^\.+/, '')
      .trim()
   const extension = extensionOf(clean)
   const stem = extension === undefined ? clean : clean.slice(0, -(extension.length + 1))

   return extension === undefined ? stem.slice(0, 120) : `${stem.slice(0, 120 - extension.length - 1)}.${extension}`
}

// Where files are kept for good (.plan/unibox-keep-messages-and-files.md): one folder per owner and account, so removing the
// account can remove its files and nothing else. Never delete from here for any other reason.
export const keptPrefix = (userId: string, accountId: string) => `kept/${userId}/${accountId}/`

export const sentKey = (userId: string, accountId: string, uploadId: string, name: string) =>
   `${keptPrefix(userId, accountId)}sent/${uploadId}/${name}`

// A file of a message of someone else: one folder per message (named by a hash, as a message id can hold any character), one
// stable name per file, so a second read of the same message finds it already there.
export const receivedKey = (userId: string, accountId: string, messageId: string, index: number, name: string) =>
   `${keptPrefix(userId, accountId)}received/${createHash('sha256').update(messageId).digest('hex').slice(0, 32)}/${index}-${safeFileName(name) || 'file'}`

export const UPLOAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// A file that went to a reply: what the spider is told, never the file itself.
export const replyFileSchema = z.strictObject({
   name: z.string().min(1).max(120),
   kind: z.enum(ATTACHMENT_KINDS),
})

export type ReplyFile = z.infer<typeof replyFileSchema>
