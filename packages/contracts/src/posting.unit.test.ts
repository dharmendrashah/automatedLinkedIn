import { describe, expect, it } from 'vitest'

import {
   POST_PHOTOS_MAX,
   POST_TEXT_MAX,
   type PostBlock,
   characterCount,
   joinedText,
   mediaBlock,
   postBlocksSchema,
   postDraftInputSchema,
   postFilesOf,
   postKey,
   postLinkOf,
   postUploadKey,
} from './posting'

const text = (id: string, value: string): PostBlock => ({
   id,
   type: 'TEXT',
   text: value,
})

const photos = (id: string, count = 1): PostBlock => ({
   id,
   type: 'PHOTOS',
   items: Array.from({ length: count }, (_, index) => ({
      id: `${id}-${index}`,
      name: `photo-${index}.jpg`,
      bytes: 1000,
   })),
})

const video: PostBlock = {
   id: 'v1',
   type: 'VIDEO',
   file: {
      id: 'v1-file',
      name: 'clip.mp4',
      bytes: 5000,
   },
}

const document: PostBlock = {
   id: 'd1',
   type: 'DOCUMENT',
   file: {
      id: 'd1-file',
      name: 'slides.pdf',
      bytes: 9000,
   },
}

const link: PostBlock = {
   id: 'l1',
   type: 'LINK',
   url: 'https://example.com/a',
}

describe('postBlocksSchema', () => {
   it('should accept text with one kind of attachment', () => {
      expect(postBlocksSchema.safeParse([text('t1', 'Hello'), photos('p1', 3)]).success).toBe(true)
      expect(postBlocksSchema.safeParse([text('t1', 'Hello'), video]).success).toBe(true)
      expect(postBlocksSchema.safeParse([link, text('t1', 'Hello')]).success).toBe(true)
      expect(postBlocksSchema.safeParse([]).success).toBe(true)
   })

   it('should refuse two attachments, since LinkedIn posts carry photos or a video or a document or a link', () => {
      expect(postBlocksSchema.safeParse([photos('p1'), video]).success).toBe(false)
      expect(postBlocksSchema.safeParse([video, link]).success).toBe(false)
      expect(postBlocksSchema.safeParse([photos('p1'), photos('p2')]).success).toBe(false)
      expect(postBlocksSchema.safeParse([document, link]).success).toBe(false)
   })

   it('should accept a document of a type LinkedIn takes, and refuse another', () => {
      expect(postBlocksSchema.safeParse([text('t1', 'Slides'), document]).success).toBe(true)
      expect(
         postBlocksSchema.safeParse([
            {
               ...document,
               file: {
                  id: 'f',
                  name: 'archive.zip',
                  bytes: 10,
               },
            },
         ]).success
      ).toBe(false)
   })

   it('should refuse more than 10 photos, an empty photo block and duplicate block ids', () => {
      expect(postBlocksSchema.safeParse([photos('p1', POST_PHOTOS_MAX)]).success).toBe(true)
      expect(postBlocksSchema.safeParse([photos('p1', POST_PHOTOS_MAX + 1)]).success).toBe(false)
      expect(postBlocksSchema.safeParse([photos('p1', 0)]).success).toBe(false)
      expect(postBlocksSchema.safeParse([text('same', 'a'), text('same', 'b')]).success).toBe(false)
   })

   it('should refuse a link that is not https, and a file of a type LinkedIn does not take', () => {
      expect(
         postBlocksSchema.safeParse([
            {
               ...link,
               url: 'http://example.com',
            },
         ]).success
      ).toBe(false)
      expect(
         postBlocksSchema.safeParse([
            {
               ...link,
               url: 'javascript:alert(1)',
            },
         ]).success
      ).toBe(false)
      expect(
         postBlocksSchema.safeParse([
            {
               ...link,
               url: 'not a link',
            },
         ]).success
      ).toBe(false)

      const badPhoto = photos('p1')

      if (badPhoto.type === 'PHOTOS') {
         badPhoto.items[0] = {
            id: 'x',
            name: 'doc.pdf',
            bytes: 10,
         }
      }

      expect(postBlocksSchema.safeParse([badPhoto]).success).toBe(false)
      expect(
         postBlocksSchema.safeParse([
            {
               ...video,
               file: {
                  id: 'f',
                  name: 'clip.avi',
                  bytes: 10,
               },
            },
         ]).success
      ).toBe(false)
   })

   it('should count the text of all text blocks together, by characters and not by code units', () => {
      const emoji = '😀'

      expect(characterCount(emoji.repeat(3))).toBe(3)
      expect(postBlocksSchema.safeParse([text('t1', 'a'.repeat(POST_TEXT_MAX))]).success).toBe(true)
      expect(postBlocksSchema.safeParse([text('t1', 'a'.repeat(POST_TEXT_MAX + 1))]).success).toBe(false)
      expect(postBlocksSchema.safeParse([text('t1', emoji.repeat(POST_TEXT_MAX))]).success).toBe(true)
      // Two blocks are joined by a blank line, which counts too.
      expect(postBlocksSchema.safeParse([text('t1', 'a'.repeat(1499)), text('t2', 'b'.repeat(1499))]).success).toBe(
         true
      )
      expect(postBlocksSchema.safeParse([text('t1', 'a'.repeat(1500)), text('t2', 'b'.repeat(1500))]).success).toBe(
         false
      )
   })
})

describe('postLinkOf', () => {
   it('should accept the address of a post, whichever kind of id LinkedIn gives it, and end it with a slash', () => {
      for (const kind of ['activity', 'share', 'ugcPost']) {
         expect(postLinkOf(`https://www.linkedin.com/feed/update/urn:li:${kind}:7520195721216827392`)).toBe(
            `https://www.linkedin.com/feed/update/urn:li:${kind}:7520195721216827392/`
         )
      }
   })

   it('should drop a query and a fragment of an address of a post', () => {
      expect(postLinkOf('https://www.linkedin.com/feed/update/urn:li:activity:7520195721216827392/?x=1#y')).toBe(
         'https://www.linkedin.com/feed/update/urn:li:activity:7520195721216827392/'
      )
   })

   it('should refuse anything that is not the address of a post on LinkedIn', () => {
      for (const value of [
         undefined,
         '',
         'not a link',
         'http://www.linkedin.com/feed/update/urn:li:activity:7520195721216827392/',
         'https://evil.example/feed/update/urn:li:activity:7520195721216827392/',
         'https://www.linkedin.com.evil.example/feed/update/urn:li:activity:7520195721216827392/',
         'https://www.linkedin.com/feed/update/urn:li:activity:abc/',
         'https://www.linkedin.com/feed/update/urn:li:person:7520195721216827392/',
         'https://www.linkedin.com/in/someone/',
         'javascript:alert(1)',
      ]) {
         expect(postLinkOf(value)).toBeUndefined()
      }
   })
})

describe('joinedText and mediaBlock', () => {
   it('should join the text blocks with a blank line and skip the empty ones', () => {
      expect(joinedText([text('t1', 'One'), photos('p1'), text('t2', ''), text('t3', 'Two')])).toBe('One\n\nTwo')
   })

   it('should find the one attachment block', () => {
      expect(mediaBlock([text('t1', 'a'), video])).toBe(video)
      expect(mediaBlock([text('t1', 'a')])).toBeUndefined()
   })
})

describe('files of a post', () => {
   it('should keep the key of an uploaded file and accept a file with none', () => {
      const keyed: PostBlock = {
         id: 'd1',
         type: 'DOCUMENT',
         file: {
            id: 'f1',
            name: 'slides.pdf',
            bytes: 10,
            key: 'posts/u1/f1/slides.pdf',
         },
      }

      expect(postBlocksSchema.safeParse([keyed]).success).toBe(true)
      expect(postBlocksSchema.safeParse([document]).success).toBe(true)
   })

   it('should list the files of photos, a video and a document, and none for text and a link', () => {
      expect(postFilesOf([text('t1', 'a'), link])).toEqual([])
      expect(postFilesOf([photos('p1', 2)]).map(({ id }) => id)).toEqual(['p1-0', 'p1-1'])
      expect(postFilesOf([video])).toEqual([
         {
            id: 'v1-file',
            name: 'clip.mp4',
            key: undefined,
         },
      ])
      expect(postFilesOf([document])[0]?.name).toBe('slides.pdf')
   })

   it('should put an upload and a kept file in one folder per owner and file', () => {
      expect(postUploadKey('u1', 'f1', 'a.jpg')).toBe('post-uploads/u1/f1/a.jpg')
      expect(postKey('u1', 'f1', 'a.jpg')).toBe('posts/u1/f1/a.jpg')
   })
})

describe('postDraftInputSchema', () => {
   const draft = {
      accountId: 'a1',
      blocks: [text('t1', 'Hello')],
      plannedAt: null,
      plannedZone: null,
   }

   it('should accept a draft without a planned time, and one with both a time and a zone', () => {
      expect(postDraftInputSchema.safeParse(draft).success).toBe(true)
      expect(
         postDraftInputSchema.safeParse({
            ...draft,
            plannedAt: '2026-11-03T09:00:00.000Z',
            plannedZone: 'Asia/Kolkata',
         }).success
      ).toBe(true)
   })

   it('should refuse a time without a zone, a zone that does not exist and a time that is not a date', () => {
      expect(
         postDraftInputSchema.safeParse({
            ...draft,
            plannedAt: '2026-11-03T09:00:00.000Z',
         }).success
      ).toBe(false)
      expect(
         postDraftInputSchema.safeParse({
            ...draft,
            plannedZone: 'Asia/Kolkata',
         }).success
      ).toBe(false)
      expect(
         postDraftInputSchema.safeParse({
            ...draft,
            plannedAt: '2026-11-03T09:00:00.000Z',
            plannedZone: 'Mars/Olympus',
         }).success
      ).toBe(false)
      expect(
         postDraftInputSchema.safeParse({
            ...draft,
            plannedAt: 'tomorrow',
            plannedZone: 'Asia/Kolkata',
         }).success
      ).toBe(false)
   })
})
