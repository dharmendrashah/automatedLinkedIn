import { z } from 'zod'

import { UPLOAD_ID, extensionOf } from './attachments'

// What a post may hold (.plan/posting-page.md). Brain enforces these on every draft it stores and reads, and the page uses the same
// rules to refuse early. The numbers are from what LinkedIn shows in its composer and are not verified against its documentation.
export const POST_TEXT_MAX = 3000
export const POST_PHOTOS_MAX = 10
export const POST_BLOCKS_MAX = 20
export const POST_ALT_MAX = 300
export const POST_PHOTO_TYPES = ['jpg', 'jpeg', 'png', 'gif']
export const POST_VIDEO_TYPES = ['mp4', 'mov']
export const POST_DOCUMENT_TYPES = ['pdf', 'ppt', 'pptx', 'doc', 'docx']
export const POST_PHOTO_BYTES = 8 * 1024 * 1024
export const POST_VIDEO_BYTES = 20 * 1024 * 1024
export const POST_DOCUMENT_BYTES = 20 * 1024 * 1024
// All the files of one post together (the platform's own limit, owner 2026-10-26).
export const POST_FILES_TOTAL_BYTES = 20 * 1024 * 1024
export const POST_DRAFTS_MAX = 200

export const POST_ONE_ATTACHMENT =
   'A post can hold photos or a video or a document or a link, not more than one of them.'

const blockId = z.string().min(1).max(64)

// Where the file is in the bucket once it was uploaded and checked; the page never makes one up (brain only accepts `postKey`).
const key = z.string().min(1).max(400).optional()

const fileName = (types: string[]) =>
   z
      .string()
      .min(1)
      .max(120)
      .refine(name => types.includes(extensionOf(name) ?? ''), `Use a file of the type ${types.join(', ')}.`)

const textBlock = z.strictObject({
   id: blockId,
   type: z.literal('TEXT'),
   // The limit that counts is on all the text of the post; this one only keeps a single block from being huge.
   text: z.string().max(POST_TEXT_MAX * 2),
})

const photo = z.strictObject({
   id: blockId,
   name: fileName(POST_PHOTO_TYPES),
   bytes: z.number().int().positive().max(POST_PHOTO_BYTES),
   alt: z.string().max(POST_ALT_MAX).optional(),
   key,
})

const photosBlock = z.strictObject({
   id: blockId,
   type: z.literal('PHOTOS'),
   items: z.array(photo).min(1).max(POST_PHOTOS_MAX),
})

const videoBlock = z.strictObject({
   id: blockId,
   type: z.literal('VIDEO'),
   file: z.strictObject({
      id: blockId,
      name: fileName(POST_VIDEO_TYPES),
      bytes: z.number().int().positive().max(POST_VIDEO_BYTES),
      key,
   }),
})

const documentBlock = z.strictObject({
   id: blockId,
   type: z.literal('DOCUMENT'),
   file: z.strictObject({
      id: blockId,
      name: fileName(POST_DOCUMENT_TYPES),
      bytes: z.number().int().positive().max(POST_DOCUMENT_BYTES),
      key,
   }),
})

const linkBlock = z.strictObject({
   id: blockId,
   type: z.literal('LINK'),
   url: z
      .string()
      .max(2000)
      .refine(value => URL.canParse(value) && new URL(value).protocol === 'https:', 'Use an https address.'),
})

const blockSchema = z.discriminatedUnion('type', [textBlock, photosBlock, videoBlock, documentBlock, linkBlock])

export type PostBlock = z.infer<typeof blockSchema>
export type PostBlockType = PostBlock['type']

const MEDIA: PostBlockType[] = ['PHOTOS', 'VIDEO', 'DOCUMENT', 'LINK']

export const isMedia = (block: PostBlock) => MEDIA.includes(block.type)

// The one attachment of the post, if it has one.
export const mediaBlock = (blocks: PostBlock[]) => blocks.find(isMedia)

// The text of the post: its text blocks one after the other, a blank line between, the empty ones left out.
export const joinedText = (blocks: PostBlock[]) =>
   blocks.flatMap(block => (block.type === 'TEXT' && block.text !== '' ? [block.text] : [])).join('\n\n')

// Characters as a person counts them, so an emoji is one.
export const characterCount = (value: string) => Array.from(value).length

export type PostFileKind = 'PHOTOS' | 'VIDEO' | 'DOCUMENT'

// The types and the size each kind of file may have, for the signed form and for the check after the upload.
export const POST_FILES: Record<PostFileKind, { types: string[]; max: number }> = {
   PHOTOS: {
      types: POST_PHOTO_TYPES,
      max: POST_PHOTO_BYTES,
   },
   VIDEO: {
      types: POST_VIDEO_TYPES,
      max: POST_VIDEO_BYTES,
   },
   DOCUMENT: {
      types: POST_DOCUMENT_TYPES,
      max: POST_DOCUMENT_BYTES,
   },
}

// A file just uploaded waits here until it is confirmed; a file of a draft is kept here. One folder per owner and per file id.
export const postUploadKey = (userId: string, fileId: string, name: string) =>
   `post-uploads/${userId}/${fileId}/${name}`

export const postKey = (userId: string, fileId: string, name: string) => `posts/${userId}/${fileId}/${name}`

export const POST_FILE_ID = UPLOAD_ID

// A post's address on LinkedIn, in any of the three forms it is given (`activity` on the feed, `share` and `ugcPost` in the
// success window); the link a run hands back is only ever one of these, checked here and again by whoever stores it.
const POST_LINK = /^\/feed\/update\/urn:li:(?:activity|share|ugcPost):\d{10,25}\/?$/

// The address with its query and fragment dropped and a slash at the end, or undefined when it is not a post's address.
export const postLinkOf = (value: string | undefined) => {
   if (!value || !URL.canParse(value)) {
      return undefined
   }

   const { protocol, hostname, pathname } = new URL(value)

   return protocol === 'https:' && hostname === 'www.linkedin.com' && POST_LINK.test(pathname)
      ? `https://www.linkedin.com${pathname.replace(/\/?$/, '/')}`
      : undefined
}

export type PostFileRef = {
   id: string
   name: string
   key: string | undefined
}

// The files a post carries, one entry each, with the key they have if they were uploaded.
export const postFilesOf = (blocks: PostBlock[]): PostFileRef[] =>
   blocks.flatMap(block => {
      if (block.type === 'PHOTOS') {
         return block.items.map(({ id, name, key: stored }) => ({
            id,
            name,
            key: stored,
         }))
      }

      return block.type === 'VIDEO' || block.type === 'DOCUMENT'
         ? [
              {
                 id: block.file.id,
                 name: block.file.name,
                 key: block.file.key,
              },
           ]
         : []
   })

const filesBytes = (blocks: PostBlock[]) =>
   blocks.reduce((total, block) => {
      if (block.type === 'PHOTOS') {
         return total + block.items.reduce((sum, { bytes }) => sum + bytes, 0)
      }

      return block.type === 'VIDEO' || block.type === 'DOCUMENT' ? total + block.file.bytes : total
   }, 0)

// What the posting task is given for the files of a post: where each one is kept and what kind it is, never the file. One kind only:
// up to ten photos, or one video, or one document (owner 2026-10-26).
export const postTaskFilesSchema = z
   .array(
      z.strictObject({
         id: z.string().regex(POST_FILE_ID),
         name: z.string().min(1).max(120),
         kind: z.enum(['PHOTOS', 'VIDEO', 'DOCUMENT']),
      })
   )
   .max(POST_PHOTOS_MAX)
   .superRefine((files, context) => {
      const kind = files[0]?.kind

      if (files.some(file => file.kind !== kind)) {
         context.addIssue({
            code: 'custom',
            message: 'A post holds photos or a video or a document, not a mix.',
         })
      }

      if (kind && kind !== 'PHOTOS' && files.length > 1) {
         context.addIssue({
            code: 'custom',
            message: 'A post holds one video or one document.',
         })
      }

      if (new Set(files.map(({ id }) => id)).size !== files.length) {
         context.addIssue({
            code: 'custom',
            message: 'Two files have the same id.',
         })
      }

      if (files.some(file => !POST_FILES[file.kind].types.includes(extensionOf(file.name) ?? ''))) {
         context.addIssue({
            code: 'custom',
            message: 'A file is of a type its kind does not take.',
         })
      }
   })

export const postBlocksSchema = z
   .array(blockSchema)
   .max(POST_BLOCKS_MAX)
   .superRefine((blocks, context) => {
      if (blocks.filter(isMedia).length > 1) {
         context.addIssue({
            code: 'custom',
            message: POST_ONE_ATTACHMENT,
         })
      }

      if (new Set(blocks.map(({ id }) => id)).size !== blocks.length) {
         context.addIssue({
            code: 'custom',
            message: 'Two blocks have the same id.',
         })
      }

      if (characterCount(joinedText(blocks)) > POST_TEXT_MAX) {
         context.addIssue({
            code: 'custom',
            message: `The text of a post can be at most ${POST_TEXT_MAX} characters.`,
         })
      }

      if (filesBytes(blocks) > POST_FILES_TOTAL_BYTES) {
         context.addIssue({
            code: 'custom',
            message: `The files of a post can be at most ${POST_FILES_TOTAL_BYTES / (1024 * 1024)} MB together.`,
         })
      }
   })

// A "Write a post" block keeps its post as one text, since block settings hold plain values only. Null when the text is not a valid
// post.
export const postBlocksOfText = (value: unknown): PostBlock[] | null => {
   if (typeof value !== 'string') {
      return null
   }

   try {
      const parsed = postBlocksSchema.safeParse(JSON.parse(value))

      return parsed.success ? parsed.data : null
   } catch {
      return null
   }
}

const isZone = (value: string) => {
   try {
      return Boolean(new Intl.DateTimeFormat('en', { timeZone: value }))
   } catch {
      return false
   }
}

// What the page sends to save a draft: no id creates one. A planned time always comes with the zone it was chosen in.
export const postDraftInputSchema = z
   .strictObject({
      id: z.string().min(1).max(64).optional(),
      accountId: z.string().min(1).max(64),
      blocks: postBlocksSchema,
      plannedAt: z.iso.datetime().nullable(),
      plannedZone: z.string().min(1).max(64).refine(isZone, 'Use a time zone name such as Asia/Kolkata.').nullable(),
   })
   .refine(({ plannedAt, plannedZone }) => (plannedAt === null) === (plannedZone === null), {
      message: 'A planned time needs its time zone, and a time zone needs its time.',
      path: ['plannedZone'],
   })

export type PostDraftInput = z.infer<typeof postDraftInputSchema>
