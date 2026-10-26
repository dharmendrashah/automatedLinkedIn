import * as contract from '@automatedLinkedIn/contracts'
import { describe, expect, it } from 'vitest'

import { type PublicationState, canTakeBack, hasActive, isPostLink, stateText } from './publication'

const LINK = 'https://www.linkedin.com/feed/update/urn:li:activity:7520195721216827392/'

describe('publication helpers', () => {
   it('should say each state in words the owner knows', () => {
      expect(stateText('SCHEDULED')).toBe('Planned')
      expect(stateText('QUEUED')).toBe('Waiting to start')
      expect(stateText('SENDING')).toBe('Posting now')
      expect(stateText('POSTED')).toBe('Posted')
      expect(stateText('FAILED')).toBe('Not posted')
      expect(stateText('UNKNOWN')).toBe('Not sure if it was posted')
   })

   it('should allow taking back a post that has not gone for sure, and no other', () => {
      const returnable: PublicationState[] = ['SCHEDULED', 'QUEUED', 'FAILED', 'UNKNOWN']

      expect(returnable.every(canTakeBack)).toBe(true)
      expect(canTakeBack('SENDING')).toBe(false)
      expect(canTakeBack('POSTED')).toBe(false)
   })

   it('should poll while a post is planned, waiting or posting, and not otherwise', () => {
      expect(hasActive(undefined)).toBe(false)
      expect(hasActive([{ state: 'POSTED' }, { state: 'FAILED' }])).toBe(false)
      expect(hasActive([{ state: 'POSTED' }, { state: 'SENDING' }])).toBe(true)
      expect(hasActive([{ state: 'SCHEDULED' }])).toBe(true)
      expect(hasActive([{ state: 'QUEUED' }])).toBe(true)
   })

   it('should answer like the contract about what is the address of a post', () => {
      for (const value of [
         LINK,
         `${LINK}?x=1`,
         'https://www.linkedin.com/feed/update/urn:li:share:7520195720021266433',
         'https://evil.example/feed/update/urn:li:activity:7520195721216827392/',
         'http://www.linkedin.com/feed/update/urn:li:activity:7520195721216827392/',
         'javascript:alert(1)',
         '',
      ]) {
         expect(isPostLink(value)).toBe(contract.postLinkOf(value) !== undefined)
      }

      expect(isPostLink(null)).toBe(false)
   })
})
