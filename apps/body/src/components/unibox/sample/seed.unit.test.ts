import { describe, expect, it } from 'vitest'

import { statusOf } from '../status'
import { sampleAccounts } from './accounts'
import { inventedConversations } from './seed'

const now = new Date(2026, 9, 23, 12, 0).getTime()
const accounts = sampleAccounts(now)
const made = inventedConversations(accounts, now, 400)

describe('sampleAccounts', () => {
   it('should give twelve accounts, two with one name, and some that cannot send', () => {
      expect(accounts).toHaveLength(12)
      expect(new Set(accounts.map(account => account.id)).size).toBe(12)
      expect(accounts.filter(account => account.name === 'Sam Rivera')).toHaveLength(2)
      expect(accounts.map(account => account.state)).toEqual(
         expect.arrayContaining(['PAUSED', 'DISCONNECTED', 'RESTRICTED'])
      )
   })

   it('should say when each was last read, or never', () => {
      expect(accounts.find(account => account.state === 'DISCONNECTED')?.lastReadAt).toBeLessThan(now - 10 * 86_400_000)
   })
})

describe('inventedConversations', () => {
   it('should make as many conversations as asked, each with its own id and an account that exists', () => {
      const ids = new Set(accounts.map(account => account.id))

      expect(made).toHaveLength(400)
      expect(new Set(made.map(conversation => conversation.id)).size).toBe(400)
      expect(made.every(conversation => ids.has(conversation.accountId))).toBe(true)
   })

   it('should be the same every time, and different for another seed', () => {
      expect(inventedConversations(accounts, now, 400)).toEqual(made)
      expect(inventedConversations(accounts, now, 400, 99)).not.toEqual(made)
   })

   it('should keep messages in time order, none in the future', () => {
      for (const conversation of made) {
         const times = conversation.messages.map(message => message.at)

         expect(times).toEqual([...times].sort((a, b) => a - b))
         expect(times.at(-1) ?? 0).toBeLessThanOrEqual(now)
      }
   })

   it('should hold what an agency inbox holds: waiting, answered and closed conversations', () => {
      const statuses = new Set(made.map(statusOf))

      expect(statuses).toEqual(new Set(['NEEDS_REPLY', 'REPLIED', 'DONE']))
      expect(made.some(conversation => conversation.unread)).toBe(true)
      expect(made.filter(conversation => statusOf(conversation) === 'NEEDS_REPLY').length).toBeGreaterThan(100)
   })

   it('should hold the odd cases: groups, links, a shortened link, messages that are only a picture, a voice note or a file', () => {
      const messages = made.flatMap(conversation => conversation.messages)

      expect(made.some(conversation => conversation.kind === 'GROUP' && conversation.participants.length > 1)).toBe(
         true
      )
      expect(messages.some(message => message.text.includes('https://'))).toBe(true)
      expect(messages.some(message => message.text.includes('https://bit.ly/'))).toBe(true)
      for (const kind of ['IMAGE', 'AUDIO', 'FILE'] as const) {
         expect(messages.some(message => message.text === '' && message.attachments[0]?.kind === kind)).toBe(true)
      }
   })

   it('should hold a very long conversation, and one read only in part', () => {
      expect(Math.max(...made.map(conversation => conversation.messages.length))).toBeGreaterThanOrEqual(500)
      expect(made.some(conversation => !conversation.complete)).toBe(true)
   })

   it('should reach the same person from more than one account, never twice from one', () => {
      const byContact = new Map<string, string[]>()

      for (const { contact, accountId } of made) {
         byContact.set(contact.profileUrl!, [...(byContact.get(contact.profileUrl!) ?? []), accountId])
      }

      const several = [...byContact.values()].filter(list => list.length > 1)

      expect(several.length).toBeGreaterThan(20)
      expect(several.every(list => new Set(list).size === list.length)).toBe(true)
   })

   it('should make nothing without accounts', () => {
      expect(inventedConversations([], now, 10)).toEqual([])
   })
})
