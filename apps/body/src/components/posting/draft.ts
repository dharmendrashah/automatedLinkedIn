import type { PostBlock } from '@automatedLinkedIn/contracts'

import {
   type Attachment,
   type AttachmentKind,
   LIMITS,
   ONE_ATTACHMENT,
   type PhotoItem,
   joinedText,
   mediaBlock,
} from './rules'

// The composer edits a post as one text and at most one attachment. These turn that into the blocks brain stores, and back.

const TEXT_ID = 'text'

export const composerOf = (blocks: PostBlock[]) => ({
   text: joinedText(blocks),
   attachment: mediaBlock(blocks),
})

// The text first, then the attachment, as LinkedIn shows them.
export const blocksOf = (text: string, attachment: Attachment | undefined): PostBlock[] => [
   ...(text === ''
      ? []
      : [
           {
              id: TEXT_ID,
              type: 'TEXT' as const,
              text,
           },
        ]),
   ...(attachment ? [attachment] : []),
]

// Nothing to keep: no words and no attachment. Such a draft is never created.
export const isBlank = (text: string, attachment: Attachment | undefined) => text.trim() === '' && !attachment

// Why this kind cannot be added next to what the post already holds; photos can be added to photos, the others replace their own.
export const attachmentRefusal = (attachment: Attachment | undefined, kind: AttachmentKind) =>
   attachment && attachment.type !== kind ? ONE_ATTACHMENT : undefined

export const isHttps = (value: string) => URL.canParse(value) && new URL(value).protocol === 'https:'

export const withPhotos = (
   attachment: Attachment | undefined,
   added: PhotoItem[],
   blockId: string
): Attachment | undefined => {
   if (added.length === 0) {
      return attachment
   }

   if (!attachment) {
      return {
         id: blockId,
         type: 'PHOTOS',
         items: added.slice(0, LIMITS.PHOTOS),
      }
   }

   return attachment.type === 'PHOTOS'
      ? {
           ...attachment,
           items: [...attachment.items, ...added].slice(0, LIMITS.PHOTOS),
        }
      : attachment
}

// The last photo takes the whole attachment with it.
export const withoutPhoto = (attachment: Attachment | undefined, photoId: string): Attachment | undefined => {
   if (attachment?.type !== 'PHOTOS') {
      return attachment
   }

   const items = attachment.items.filter(({ id }) => id !== photoId)

   return items.length > 0 ? { ...attachment, items } : undefined
}

export const withAlt = (attachment: Attachment | undefined, photoId: string, alt: string): Attachment | undefined =>
   attachment?.type === 'PHOTOS'
      ? {
           ...attachment,
           items: attachment.items.map(item => (item.id === photoId ? { ...item, alt } : item)),
        }
      : attachment

// The files of the attachment, each with its id, name and the key it has once it was uploaded.
export const attachmentFiles = (attachment: Attachment | undefined) => {
   if (attachment?.type === 'PHOTOS') {
      return attachment.items.map(({ id, name, key }) => ({ id, name, key }))
   }

   return attachment?.type === 'VIDEO' || attachment?.type === 'DOCUMENT'
      ? [{ id: attachment.file.id, name: attachment.file.name, key: attachment.file.key }]
      : []
}

// A file was uploaded and checked: the draft keeps where it is, and the name brain settled on.
export const withKey = (
   attachment: Attachment | undefined,
   fileId: string,
   uploaded: { key: string; name: string }
): Attachment | undefined => {
   if (attachment?.type === 'PHOTOS') {
      return {
         ...attachment,
         items: attachment.items.map(item => (item.id === fileId ? { ...item, ...uploaded } : item)),
      }
   }

   if ((attachment?.type === 'VIDEO' || attachment?.type === 'DOCUMENT') && attachment.file.id === fileId) {
      return {
         ...attachment,
         file: {
            ...attachment.file,
            ...uploaded,
         },
      }
   }

   return attachment
}

export const truncateToRoom = (value: string, room: number) => Array.from(value).slice(0, Math.max(0, room)).join('')
