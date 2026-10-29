import { describe, expect, it } from 'vitest'

import { type UniboxConversation } from '../types'

import { sampleRecipients, startedKey } from './recipients'

const talking = (over: Partial<UniboxConversation> = {}): UniboxConversation => ({
   id: 'c1',
   accountId: 'a1',
   contact: { name: 'Ada Byron', profileUrl: 'https://www.linkedin.com/in/ada-byron/' },
   participants: [],
   kind: 'DIRECT',
   unread: false,
   complete: true,
   messages: [],
   ...over,
})

const find = (
   accountIds: string[],
   conversations: UniboxConversation[],
   query: string,
   started = new Map<string, string>()
) => sampleRecipients(accountIds, conversations, started, { query }).people

describe('sampleRecipients', () => {
   it('should list the people each account talks to with their conversation, account and standing, and the others without', () => {
      const list = find(['a1'], [talking()], '')

      expect(list.find(person => person.slug === 'ada-byron')).toMatchObject({
         conversationId: 'c1',
         accountId: 'a1',
         status: 'TALKED',
      })
      expect(list.find(person => person.slug === 'grace-hopper-demo')).toMatchObject({ status: 'NEVER' })
      expect(list.find(person => person.slug === 'grace-hopper-demo')?.conversationId).toBeUndefined()
      expect(list.find(person => person.blocked)?.blocked).toBe('DO_NOT_CONTACT')
   })

   it('should take every account given, spread the invented people over them, and leave out groups', () => {
      const list = find(
         ['a1', 'a2'],
         [talking({ accountId: 'a2' }), talking({ id: 'g', kind: 'GROUP', accountId: 'a1' })],
         ''
      )

      expect(list.find(person => person.name === 'Ada Byron')?.accountId).toBe('a2')
      expect(new Set(list.map(person => person.accountId))).toEqual(new Set(['a1', 'a2']))
      expect(find(['a3'], [talking()], 'ada')).toEqual([])
   })

   it('should find a person by any word of the name or headline, without caring for case or accents', () => {
      const list = find(['a1'], [], 'MATHEMATICIAN')

      expect(list.map(person => person.slug).sort()).toEqual(['alan-turing-demo', 'katherine-johnson-demo'])
      expect(find(['a1'], [], 'zzzz')).toEqual([])
   })

   it('should keep only the accounts and standing asked for, and count them', () => {
      const page = sampleRecipients(['a1', 'a2'], [talking({ accountId: 'a2' })], new Map(), {
         query: '',
         accountIds: ['a2'],
         status: 'TALKED',
      })

      expect(page).toEqual({
         people: [expect.objectContaining({ slug: 'ada-byron' })],
         total: 1,
      })
   })

   it('should treat a person written to from the page as waiting on them', () => {
      const list = find(['a1'], [], 'turing', new Map([[startedKey('a1', 'alan-turing-demo'), 'sample-1']]))

      expect(list).toEqual([
         expect.objectContaining({ slug: 'alan-turing-demo', conversationId: 'sample-1', status: 'WAITING' }),
      ])
   })
})
