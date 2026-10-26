import { describe, expect, it } from 'vitest'

import { describePost, postRerunOf, rerunRefusal } from './postRerun'

const FILE_ID = '0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b34'
const textBlock = {
   id: '0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b01',
   type: 'TEXT',
   text: 'Hello world',
}
const photos = {
   id: '0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b02',
   type: 'PHOTOS',
   items: [
      {
         id: FILE_ID,
         name: 'a b.jpg',
         bytes: 1000,
         alt: '',
         key: `posts/user-1/${FILE_ID}/a b.jpg`,
      },
   ],
}

describe('rerunRefusal', () => {
   it('allows a post that failed and refuses any that may be on LinkedIn or may still be sent', () => {
      expect(rerunRefusal('FAILED')).toBeUndefined()

      for (const state of ['POSTED', 'UNKNOWN', 'SENDING', 'QUEUED', 'SCHEDULED']) {
         expect(rerunRefusal(state)).toMatch(/not run again/)
      }
   })
})

describe('postRerunOf', () => {
   it('builds the input brain sent and the bucket key of each file', () => {
      const rerun = postRerunOf({
         blocks: [textBlock, photos],
         audience: 'CONNECTIONS',
         comments: 'ANYONE',
      })

      expect(rerun.input).toEqual({
         text: 'Hello world',
         files: [
            {
               id: FILE_ID,
               name: 'a b.jpg',
               kind: 'PHOTOS',
            },
         ],
         audience: 'CONNECTIONS',
         comments: 'ANYONE',
      })
      expect(rerun.keys).toEqual({ [FILE_ID]: `posts/user-1/${FILE_ID}/a b.jpg` })
   })

   it('stops on blocks it cannot read, without printing them', () => {
      expect(() =>
         postRerunOf({
            blocks: [
               {
                  type: 'NOPE',
                  text: 'secret words',
               },
            ],
            audience: 'ANYONE',
            comments: 'ANYONE',
         })
      ).toThrow(/could not be read/)
      expect(() =>
         postRerunOf({
            blocks: [],
            audience: 'ANYONE',
            comments: 'ANYONE',
         })
      ).toThrow(/could not be read/)
   })
})

describe('describePost', () => {
   it('shows the words, the files, who sees it and who may comment', () => {
      const { input } = postRerunOf({
         blocks: [textBlock, photos],
         audience: 'CONNECTIONS',
         comments: 'OFF',
      })

      expect(describePost(input).join('\n')).toMatch(/Hello world[\s\S]*a b\.jpg[\s\S]*CONNECTIONS[\s\S]*OFF/)
   })
})
