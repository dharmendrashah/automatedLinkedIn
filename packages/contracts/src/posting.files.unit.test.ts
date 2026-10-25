import { describe, expect, it } from 'vitest'

import {
   POST_FILES_TOTAL_BYTES,
   POST_PHOTOS_MAX,
   POST_VIDEO_BYTES,
   type PostBlock,
   postBlocksSchema,
   postTaskFilesSchema,
} from './posting'

const MB = 1024 * 1024
const ID = '0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b34'

const photos = (sizes: number[]): PostBlock => ({
   id: 'p1',
   type: 'PHOTOS',
   items: sizes.map((bytes, index) => ({
      id: `p1-${index}`,
      name: `photo-${index}.jpg`,
      bytes,
   })),
})

describe('the files of a post together', () => {
   it('should be at most 20 MB, so ten small photos fit and ten large ones do not', () => {
      expect(POST_FILES_TOTAL_BYTES).toBe(20 * MB)
      expect(postBlocksSchema.safeParse([photos(Array.from({ length: 10 }, () => 2 * MB))]).success).toBe(true)
      expect(postBlocksSchema.safeParse([photos(Array.from({ length: 10 }, () => 2 * MB + 1))]).success).toBe(false)
   })

   it('should hold a video or a document of at most 20 MB', () => {
      expect(POST_VIDEO_BYTES).toBe(20 * MB)
      expect(
         postBlocksSchema.safeParse([
            {
               id: 'v1',
               type: 'VIDEO',
               file: {
                  id: 'f1',
                  name: 'clip.mp4',
                  bytes: 20 * MB,
               },
            },
         ]).success
      ).toBe(true)
      expect(
         postBlocksSchema.safeParse([
            {
               id: 'd1',
               type: 'DOCUMENT',
               file: {
                  id: 'f1',
                  name: 'slides.pdf',
                  bytes: 20 * MB + 1,
               },
            },
         ]).success
      ).toBe(false)
   })
})

describe('postTaskFilesSchema', () => {
   const file = (kind: 'PHOTOS' | 'VIDEO' | 'DOCUMENT', name: string, id = ID) => ({
      id,
      name,
      kind,
   })
   const other = '0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b35'

   it('should accept up to ten photos, one video, one document, or no file', () => {
      expect(postTaskFilesSchema.safeParse([]).success).toBe(true)
      expect(postTaskFilesSchema.safeParse([file('PHOTOS', 'a.jpg'), file('PHOTOS', 'b.PNG', other)]).success).toBe(
         true
      )
      expect(postTaskFilesSchema.safeParse([file('VIDEO', 'clip.mp4')]).success).toBe(true)
      expect(postTaskFilesSchema.safeParse([file('DOCUMENT', 'slides.pdf')]).success).toBe(true)
   })

   it('should refuse a mix of kinds, a second video or document, and more than ten photos', () => {
      expect(postTaskFilesSchema.safeParse([file('PHOTOS', 'a.jpg'), file('VIDEO', 'clip.mp4', other)]).success).toBe(
         false
      )
      expect(postTaskFilesSchema.safeParse([file('VIDEO', 'a.mp4'), file('VIDEO', 'b.mp4', other)]).success).toBe(false)
      expect(postTaskFilesSchema.safeParse([file('DOCUMENT', 'a.pdf'), file('DOCUMENT', 'b.pdf', other)]).success).toBe(
         false
      )

      const eleven = Array.from({ length: POST_PHOTOS_MAX + 1 }, (_, index) =>
         file('PHOTOS', `p${index}.jpg`, `0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b${String(index).padStart(2, '0')}`)
      )

      expect(postTaskFilesSchema.safeParse(eleven).success).toBe(false)
   })

   it('should refuse a name whose type does not fit its kind, a repeated id and an id that is not one', () => {
      expect(postTaskFilesSchema.safeParse([file('PHOTOS', 'a.pdf')]).success).toBe(false)
      expect(postTaskFilesSchema.safeParse([file('DOCUMENT', 'a.jpg')]).success).toBe(false)
      expect(postTaskFilesSchema.safeParse([file('PHOTOS', 'a.jpg'), file('PHOTOS', 'b.jpg')]).success).toBe(false)
      expect(postTaskFilesSchema.safeParse([file('PHOTOS', 'a.jpg', '../x')]).success).toBe(false)
   })
})
