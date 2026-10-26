import { describe, expect, it } from 'vitest'

import type { PostBlock } from '@automatedLinkedIn/contracts'

import { readPostBlocks } from './post-config'

const blocks: PostBlock[] = [
   {
      id: 't1',
      type: 'TEXT',
      text: 'Hello',
   },
   {
      id: 'p1',
      type: 'PHOTOS',
      items: [
         {
            id: 'f1',
            name: 'a.jpg',
            bytes: 100,
            key: 'posts/u1/f1/a.jpg',
            alt: 'A photo',
         },
      ],
   },
]

describe('readPostBlocks', () => {
   it('should read the post a block kept as text', () => {
      expect(readPostBlocks(JSON.stringify(blocks))).toEqual(blocks)
      expect(
         readPostBlocks(
            JSON.stringify([
               {
                  id: 'l1',
                  type: 'LINK',
                  url: 'https://example.com',
               },
            ])
         )
      ).toHaveLength(1)
      expect(readPostBlocks('[]')).toEqual([])
   })

   it('should read nothing from a value that is not a post', () => {
      expect(readPostBlocks(undefined)).toEqual([])
      expect(readPostBlocks(['x'])).toEqual([])
      expect(readPostBlocks('not json')).toEqual([])
      expect(readPostBlocks('{"type":"TEXT"}')).toEqual([])
      expect(readPostBlocks(JSON.stringify([{ id: 't1', type: 'TEXT' }]))).toEqual([])
      expect(readPostBlocks(JSON.stringify([{ id: 'v1', type: 'VIDEO', file: { id: 'f1' } }]))).toEqual([])
   })
})
