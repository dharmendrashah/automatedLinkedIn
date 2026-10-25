import type { PostBlock } from '@automatedLinkedIn/contracts'

// A "Write a post" block keeps its post as one text, because block settings hold plain values only. Brain checks it on every save;
// this only tells the shapes apart so a value that does not read as a post is shown as an empty one.

const isRecord = (value: unknown): value is Record<string, unknown> =>
   typeof value === 'object' && value !== null && !Array.isArray(value)

const isFile = (value: unknown) =>
   isRecord(value) &&
   typeof value.id === 'string' &&
   typeof value.name === 'string' &&
   typeof value.bytes === 'number' &&
   (value.key === undefined || typeof value.key === 'string')

const isBlock = (value: unknown): value is PostBlock => {
   if (!isRecord(value) || typeof value.id !== 'string') {
      return false
   }

   switch (value.type) {
      case 'TEXT':
         return typeof value.text === 'string'
      case 'PHOTOS':
         return Array.isArray(value.items) && value.items.every(isFile)
      case 'VIDEO':
      case 'DOCUMENT':
         return isFile(value.file)
      case 'LINK':
         return typeof value.url === 'string'
      default:
         return false
   }
}

export const readPostBlocks = (value: unknown): PostBlock[] => {
   if (typeof value !== 'string') {
      return []
   }

   try {
      const parsed: unknown = JSON.parse(value)

      return Array.isArray(parsed) && parsed.every(isBlock) ? parsed : []
   } catch {
      return []
   }
}
