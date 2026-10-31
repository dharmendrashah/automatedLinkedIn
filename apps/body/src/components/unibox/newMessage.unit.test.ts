import { describe, expect, it } from 'vitest'

import { type Recipient, type UniboxAccount } from './types'

import {
   alsoTalking,
   countLine,
   directOutcome,
   draftConversation,
   isPlaceholder,
   noRecipients,
   notActiveReason,
   placeholderId,
   recipientBlock,
   startingAccounts,
} from './newMessage'
import { statusOf } from './status'

const account = (state: UniboxAccount['state']): UniboxAccount => ({
   id: 'a1',
   name: 'Ada',
   handle: 'ada@x.test',
   headline: '',
   state,
})

const person = (slug: string, over: Partial<Recipient> = {}): Recipient => ({
   slug,
   accountId: 'a1',
   name: slug.toUpperCase(),
   headline: '',
   status: 'NEVER',
   ...over,
})

describe('draftConversation', () => {
   it('should stand in for a conversation not begun yet, with nothing on its way, and name its person for the card and drawer', () => {
      const conversation = draftConversation(account('ACTIVE'), person('grace-h', { name: 'Grace Hopper' }))

      expect(conversation).toMatchObject({
         id: placeholderId('a1', 'grace-h'),
         accountId: 'a1',
         contact: { name: 'Grace Hopper', profileUrl: 'https://www.linkedin.com/in/grace-h/' },
         contactSlug: 'grace-h',
         messages: [],
         starting: { slug: 'grace-h' },
      })
      expect(conversation.sending).toBeUndefined()
      expect(statusOf(conversation)).toBe('NONE')
      expect(isPlaceholder(conversation.id)).toBe(true)
   })

   it('should not take a real conversation id for a stand-in', () => {
      expect(isPlaceholder('2-abc==')).toBe(false)
   })
})

describe('alsoTalking', () => {
   const now = Date.parse('2026-10-30T12:00:00Z')
   const names = new Map([
      ['a2', 'Sushi Shreechand'],
      ['a3', 'Dharmendra Soni'],
   ])
   const nameOf = (id: string) => names.get(id)

   it('should name the other account that talks with the person, and when it last did', () => {
      expect(alsoTalking(person('x', { alsoWith: [{ accountId: 'a2', at: now - 3 * 86_400_000 }] }), nameOf, now)).toBe(
         'Also talking from Sushi Shreechand, 3d ago'
      )
      expect(alsoTalking(person('x', { alsoWith: [{ accountId: 'a2' }] }), nameOf, now)).toBe(
         'Also talking from Sushi Shreechand'
      )
   })

   it('should count the others when there are several, and say nothing when none', () => {
      expect(
         alsoTalking(
            person('x', { alsoWith: [{ accountId: 'a2' }, { accountId: 'a3' }, { accountId: 'gone' }] }),
            nameOf,
            now
         )
      ).toBe('Also talking from Sushi Shreechand and 2 other accounts')
      expect(alsoTalking(person('x'), nameOf, now)).toBeUndefined()
   })
})

describe('countLine', () => {
   it('should say how many there are, and that only the first are shown when the list is cut', () => {
      expect(countLine(1, 1)).toBe('1 person')
      expect(countLine(12, 12)).toBe('12 people')
      expect(countLine(200, 1240)).toBe('1,240 people. The first 200 are shown; type a name to find anyone.')
   })
})

describe('startingAccounts', () => {
   it('should start on the last choice, then the accounts the Unibox shows, then the open conversation, else every account', () => {
      const picked = new Set(['a1'])

      expect(startingAccounts({ last: new Set(['a3']), picked, open: 'a2' })).toEqual(new Set(['a3']))
      expect(startingAccounts({ last: undefined, picked, open: 'a2' })).toEqual(picked)
      expect(startingAccounts({ last: undefined, picked: undefined, open: 'a2' })).toEqual(new Set(['a2']))
      expect(startingAccounts({ last: undefined, picked: undefined })).toBeUndefined()
   })

   it('should keep every account when that was the last choice', () => {
      expect(startingAccounts({ last: 'ALL', picked: new Set(['a1']), open: 'a2' })).toBeUndefined()
   })
})

describe('directOutcome', () => {
   it('should open the person found, and send anyone else to New message with a sentence', () => {
      const grace = person('grace-h', { name: 'Grace Hopper' })

      expect(directOutcome(grace, 'grace-h', 'Tripti')).toEqual({ open: grace })
      expect(directOutcome(null, 'grace-h', 'Tripti')).toEqual({
         message: 'This person is not a connection of Tripti any more, or its connections were not read yet.',
         search: 'grace-h',
      })
      expect(directOutcome({ ...grace, blocked: 'DO_NOT_CONTACT' }, 'grace-h', 'Tripti')).toEqual({
         message: 'Grace Hopper is on your do-not-contact list.',
         search: 'Grace Hopper',
      })
      expect(directOutcome('failed', 'grace-h', 'Tripti')).toMatchObject({ search: 'grace-h' })
   })
})

describe('notActiveReason', () => {
   it('should say nothing for an active account and why for each other state', () => {
      expect(notActiveReason(account('ACTIVE'))).toBeUndefined()
      expect(notActiveReason(account('PAUSED'))).toMatch(/paused/)
      expect(notActiveReason(account('DISCONNECTED'))).toMatch(/disconnected/)
      expect(notActiveReason(account('RESTRICTED'))).toMatch(/restricted/)
      expect(notActiveReason(undefined)).toMatch(/not known/)
   })
})

describe('recipientBlock', () => {
   it('should refuse only a person on the do-not-contact list', () => {
      expect(recipientBlock(person('a'))).toBeUndefined()
      expect(recipientBlock(person('a', { blocked: 'DO_NOT_CONTACT' }))).toMatch(/do-not-contact/)
   })
})

describe('noRecipients', () => {
   it('should tell a search or filter that found nobody from no connections read at all', () => {
      expect(noRecipients({ query: 'gra' })).toMatch(/No connection matches/)
      expect(noRecipients({ query: '  ' })).toMatch(/Read the connections/)
      expect(noRecipients({ query: '', status: 'NEEDS_REPLY' })).toBe(
         'No one is waiting for your reply on these accounts.'
      )
      expect(noRecipients({ query: '', accountIds: ['a1'] })).toBe('No connection of these accounts matches.')
   })
})
