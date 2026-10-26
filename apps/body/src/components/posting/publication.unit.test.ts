import * as contract from '@automatedLinkedIn/contracts'
import { describe, expect, it } from 'vitest'

import { type PublicationState, canTakeBack, hasActive, isPostLink, stateText, waitingText } from './publication'

const LINK = 'https://www.linkedin.com/feed/update/urn:li:activity:7520195721216827392/'

describe('waitingText', () => {
   // 17:55 in Kolkata is 08:25 in New York.
   const now = Date.parse('2026-10-26T12:25:00.000Z')
   const options = {
      now,
      localZone: 'Asia/Kolkata',
      locale: 'en-GB',
   }
   const reason = "Waiting for the account's next slot."

   it('should say the time in the viewer’s zone and in the account’s, and how long it is', () => {
      expect(
         waitingText(
            {
               reason,
               until: '2026-10-26T12:28:00.000Z',
               zone: 'America/New_York',
            },
            options
         )
      ).toBe("Waiting for the account's next slot. It can start at 17:58 your time (08:28 New York), in about 3 min.")
   })

   it('should leave out the account’s zone when it is the viewer’s own or not known', () => {
      const until = '2026-10-26T12:28:00.000Z'

      expect(waitingText({ reason, until, zone: 'Asia/Kolkata' }, options)).toBe(
         "Waiting for the account's next slot. It can start at 17:58, in about 3 min."
      )
      expect(waitingText({ reason, until, zone: null }, options)).toBe(
         "Waiting for the account's next slot. It can start at 17:58 your time, in about 3 min."
      )
      expect(waitingText({ reason, until, zone: 'Mars/Base' }, options)).toBe(
         "Waiting for the account's next slot. It can start at 17:58 your time, in about 3 min."
      )
   })

   it('should say any moment now once the time has come, hours for a long wait, and nothing of time without one', () => {
      expect(waitingText({ reason, until: '2026-10-26T12:24:00.000Z', zone: null }, options)).toContain('any moment now')
      expect(waitingText({ reason, until: '2026-10-26T14:25:00.000Z', zone: null }, options)).toContain('in about 2 h')
      expect(waitingText({ reason: 'Waiting for another task on this account to finish.', until: null, zone: null }, options)).toBe(
         'Waiting for another task on this account to finish.'
      )
   })

   it('should name the day when the time is not today', () => {
      expect(waitingText({ reason, until: '2026-10-27T03:30:00.000Z', zone: null }, options)).toBe(
         "Waiting for the account's next slot. It can start on Tue 09:00 your time, in about 15 h."
      )
   })
})

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
