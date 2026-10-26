import type { PostBlock } from '@automatedLinkedIn/contracts'

export type Attachment = Exclude<PostBlock, { type: 'TEXT' }>
export type AttachmentKind = Attachment['type']
export type PhotoItem = Extract<PostBlock, { type: 'PHOTOS' }>['items'][number]
export type FileRef = Extract<PostBlock, { type: 'VIDEO' }>['file']

// The rules of a post, as `packages/contracts/src/posting.ts` has them. The page cannot import that package's values (it is
// CommonJS and would load the whole contract into the browser), so the few it needs are here and `rules.unit.test.ts` fails when
// the two differ.
export const LIMITS = {
   TEXT: 3000,
   PHOTOS: 10,
   ALT: 300,
   PHOTO_BYTES: 8 * 1024 * 1024,
   VIDEO_BYTES: 20 * 1024 * 1024,
   DOCUMENT_BYTES: 20 * 1024 * 1024,
   FILES_BYTES: 20 * 1024 * 1024,
   PHOTO_TYPES: ['jpg', 'jpeg', 'png', 'gif'],
   VIDEO_TYPES: ['mp4', 'mov'],
   DOCUMENT_TYPES: ['pdf', 'ppt', 'pptx', 'doc', 'docx'],
}

export const ONE_ATTACHMENT = 'A post can hold photos or a video or a document or a link, not more than one of them.'

export const isMedia = (block: PostBlock): block is Attachment => block.type !== 'TEXT'

export const mediaBlock = (blocks: PostBlock[]) => blocks.find(isMedia)

export const joinedText = (blocks: PostBlock[]) =>
   blocks.flatMap(block => (block.type === 'TEXT' && block.text !== '' ? [block.text] : [])).join('\n\n')

// Characters as a person counts them, so an emoji is one.
export const characterCount = (value: string) => Array.from(value).length
