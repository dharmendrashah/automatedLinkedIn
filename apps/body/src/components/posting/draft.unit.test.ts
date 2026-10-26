import { describe, expect, it } from 'vitest'

import type { PostBlock } from '@automatedLinkedIn/contracts'

import {
   attachmentFiles,
   attachmentRefusal,
   blocksOf,
   composerOf,
   isBlank,
   truncateToRoom,
   withAlt,
   withKey,
   withPhotos,
   withoutPhoto,
} from './draft'
import type { Attachment } from './rules'

const photo = (id: string) => ({
   id,
   name: `${id}.jpg`,
   bytes: 10,
})

const link: Attachment = {
   id: 'l1',
   type: 'LINK',
   url: 'https://example.com',
}

describe('composerOf and blocksOf', () => {
   it('should read a stored post as its words and its attachment, and write them back text first', () => {
      const stored: PostBlock[] = [link, { id: 't1', type: 'TEXT', text: 'Hello' }]
      const { text, attachment } = composerOf(stored)

      expect(text).toBe('Hello')
      expect(attachment).toBe(link)
      expect(blocksOf(text, attachment).map(block => block.type)).toEqual(['TEXT', 'LINK'])
   })

   it('should merge the text blocks of an older draft into one, in order', () => {
      const { text } = composerOf([
         { id: 'a', type: 'TEXT', text: 'One' },
         { id: 'b', type: 'TEXT', text: 'Two' },
      ])

      expect(text).toBe('One\n\nTwo')
      expect(blocksOf(text, undefined)).toEqual([{ id: 'text', type: 'TEXT', text: 'One\n\nTwo' }])
   })

   it('should store no text block for no words', () => {
      expect(blocksOf('', link)).toEqual([link])
      expect(blocksOf('', undefined)).toEqual([])
   })
})

describe('isBlank', () => {
   it('should be blank only without words and without an attachment', () => {
      expect(isBlank('  \n', undefined)).toBe(true)
      expect(isBlank('Hi', undefined)).toBe(false)
      expect(isBlank('', link)).toBe(false)
   })
})

describe('attachmentRefusal', () => {
   it('should allow the same kind again and any kind when nothing is attached', () => {
      expect(attachmentRefusal(undefined, 'VIDEO')).toBeUndefined()
      expect(attachmentRefusal(link, 'LINK')).toBeUndefined()
      expect(attachmentRefusal(withPhotos(undefined, [photo('a')], 'p'), 'PHOTOS')).toBeUndefined()
   })

   it('should say why another kind cannot be added', () => {
      expect(attachmentRefusal(link, 'PHOTOS')).toMatch(/photos or a video or a document or a link/i)
   })
})

describe('photos', () => {
   it('should start a photo attachment, add to it up to 10 and keep the order', () => {
      const first = withPhotos(undefined, [photo('a'), photo('b')], 'p1')
      const more = withPhotos(
         first,
         Array.from({ length: 25 }, (_, index) => photo(`n${index}`)),
         'ignored'
      )

      expect(first).toMatchObject({ id: 'p1', type: 'PHOTOS' })
      expect(more?.type === 'PHOTOS' && more.items).toHaveLength(10)
      expect(more?.type === 'PHOTOS' && more.items.slice(0, 2).map(({ id }) => id)).toEqual(['a', 'b'])
   })

   it('should not add photos to another kind of attachment, or add nothing', () => {
      expect(withPhotos(link, [photo('a')], 'p')).toBe(link)
      expect(withPhotos(undefined, [], 'p')).toBeUndefined()
   })

   it('should set a description, and drop the attachment with its last photo', () => {
      const start = withPhotos(undefined, [photo('a'), photo('b')], 'p1')
      const described = withAlt(start, 'b', 'A dog')

      expect(described?.type === 'PHOTOS' && described.items[1]).toMatchObject({ alt: 'A dog' })

      const one = withoutPhoto(described, 'a')

      expect(one?.type === 'PHOTOS' && one.items.map(({ id }) => id)).toEqual(['b'])
      expect(withoutPhoto(one, 'b')).toBeUndefined()
      expect(withoutPhoto(link, 'x')).toBe(link)
   })
})

describe('attachmentFiles', () => {
   it('should list the files of photos, a video and a document, and none for a link or nothing', () => {
      const photos = withPhotos(undefined, [photo('a'), { ...photo('b'), key: 'posts/u/b/b.jpg' }], 'p')
      const document: Attachment = { id: 'd', type: 'DOCUMENT', file: { id: 'f', name: 'x.pdf', bytes: 1 } }

      expect(attachmentFiles(photos).map(({ id, key }) => [id, key])).toEqual([
         ['a', undefined],
         ['b', 'posts/u/b/b.jpg'],
      ])
      expect(attachmentFiles(document)).toEqual([{ id: 'f', name: 'x.pdf', key: undefined }])
      expect(attachmentFiles(link)).toEqual([])
      expect(attachmentFiles(undefined)).toEqual([])
   })
})

describe('withKey', () => {
   const uploaded = {
      key: 'posts/u1/b/b.jpg',
      name: 'b.jpg',
   }

   it('should give the key to the photo it belongs to and to no other', () => {
      const start = withPhotos(undefined, [photo('a'), photo('b')], 'p1')
      const keyed = withKey(start, 'b', uploaded)

      expect(keyed?.type === 'PHOTOS' && keyed.items.map(item => item.key)).toEqual([undefined, 'posts/u1/b/b.jpg'])
   })

   it('should give the key to a video or a document, and ignore another file or a link', () => {
      const video: Attachment = { id: 'v', type: 'VIDEO', file: { id: 'f', name: 'x.mp4', bytes: 1 } }

      expect(withKey(video, 'f', uploaded)).toMatchObject({ file: { key: 'posts/u1/b/b.jpg', name: 'b.jpg' } })
      expect(withKey(video, 'other', uploaded)).toBe(video)
      expect(withKey(link, 'f', uploaded)).toBe(link)
      expect(withKey(undefined, 'f', uploaded)).toBeUndefined()
   })
})

describe('truncateToRoom', () => {
   it('should cut by characters, so an emoji is never split', () => {
      expect(truncateToRoom('😀😀😀', 2)).toBe('😀😀')
      expect(truncateToRoom('abc', 10)).toBe('abc')
      expect(truncateToRoom('abc', 0)).toBe('')
   })
})
