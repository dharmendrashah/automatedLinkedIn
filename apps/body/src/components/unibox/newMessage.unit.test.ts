import { describe, expect, it } from 'vitest'

import { type Recipient, type UniboxAccount, type UniboxConversation } from './types'

import { buildIndex } from './inbox'
import {
   connectionEntries,
   draftConversation,
   isPlaceholder,
   noRecipients,
   notActiveReason,
   placeholderId,
   recipientBlock,
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
   ...over,
})

const talk = (id: string, direction: 'ME' | 'THEM', at: number): UniboxConversation => ({
   id,
   accountId: 'a1',
   contact: { name: id },
   participants: [],
   kind: 'DIRECT',
   unread: false,
   complete: true,
   messages: [{ id: `${id}-m`, direction, sender: id, at, when: '', text: `last of ${id}`, attachments: [] }],
})

describe('draftConversation', () => {
   it('should stand in for a conversation not begun yet, with nothing on its way', () => {
      const conversation = draftConversation(account('ACTIVE'), person('grace-h', { name: 'Grace Hopper' }))

      expect(conversation).toMatchObject({
         id: placeholderId('a1', 'grace-h'),
         accountId: 'a1',
         contact: { name: 'Grace Hopper', profileUrl: 'https://www.linkedin.com/in/grace-h/' },
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

describe('connectionEntries', () => {
   const index = buildIndex(
      [account('ACTIVE')],
      [talk('waits', 'THEM', 100), talk('newer', 'ME', 300), talk('older', 'ME', 200)],
      new Set()
   )

   it('should put the ones to answer first, then the latest talked to, then the new ones by name, and do-not-contact last', () => {
      const entries = connectionEntries(
         [
            person('zed'),
            person('blocked', { blocked: 'DO_NOT_CONTACT' }),
            person('older', { conversationId: 'older' }),
            person('amy'),
            person('waits', { conversationId: 'waits' }),
            person('newer', { conversationId: 'newer' }),
         ],
         index.byId
      )

      expect(entries.map(entry => entry.person.slug)).toEqual(['waits', 'newer', 'older', 'amy', 'zed', 'blocked'])
      expect(entries.map(entry => entry.state)).toEqual(['NEEDS_REPLY', 'WAITING', 'WAITING', 'NEW', 'NEW', 'BLOCKED'])
      expect(entries[0]?.last).toMatchObject({ at: 100, text: 'last of waits', mine: false })
      expect(entries[3]?.last).toBeUndefined()
   })

   it('should call a person new when the conversation it names is not on the page', () => {
      expect(connectionEntries([person('gone', { conversationId: 'missing' })], index.byId)[0]?.state).toBe('NEW')
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
   it('should tell a search that found nobody from no connections read at all', () => {
      expect(noRecipients('gra')).toMatch(/No connection matches/)
      expect(noRecipients('  ')).toMatch(/Read the connections/)
   })
})
