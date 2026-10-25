import * as contract from '@automatedLinkedIn/contracts'
import type { PostBlock } from '@automatedLinkedIn/contracts'
import { describe, expect, it } from 'vitest'

import { LIMITS, ONE_ATTACHMENT, characterCount, joinedText, mediaBlock } from './rules'

const blocks: PostBlock[] = [
   {
      id: 't1',
      type: 'TEXT',
      text: 'One',
   },
   {
      id: 't2',
      type: 'TEXT',
      text: '',
   },
   {
      id: 't3',
      type: 'TEXT',
      text: 'Two 😀',
   },
   {
      id: 'l1',
      type: 'LINK',
      url: 'https://example.com',
   },
]

describe('posting rules', () => {
   it('should hold the same numbers and types as the contract', () => {
      expect(LIMITS).toEqual({
         TEXT: contract.POST_TEXT_MAX,
         PHOTOS: contract.POST_PHOTOS_MAX,
         ALT: contract.POST_ALT_MAX,
         PHOTO_BYTES: contract.POST_PHOTO_BYTES,
         VIDEO_BYTES: contract.POST_VIDEO_BYTES,
         DOCUMENT_BYTES: contract.POST_DOCUMENT_BYTES,
         FILES_BYTES: contract.POST_FILES_TOTAL_BYTES,
         PHOTO_TYPES: contract.POST_PHOTO_TYPES,
         VIDEO_TYPES: contract.POST_VIDEO_TYPES,
         DOCUMENT_TYPES: contract.POST_DOCUMENT_TYPES,
      })
      expect(ONE_ATTACHMENT).toBe(contract.POST_ONE_ATTACHMENT)
   })

   it('should answer like the contract for the same blocks', () => {
      expect(joinedText(blocks)).toBe(contract.joinedText(blocks))
      expect(mediaBlock(blocks)).toBe(contract.mediaBlock(blocks))
      expect(characterCount('a😀')).toBe(contract.characterCount('a😀'))
   })
})
