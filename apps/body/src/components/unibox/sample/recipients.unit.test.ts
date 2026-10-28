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

describe('sampleRecipients', () => {
   it('should list the people each account talks to with their conversation and account, and the others without', () => {
      const list = sampleRecipients(['a1'], [talking()], new Map(), '')

      expect(list.find(person => person.slug === 'ada-byron')).toMatchObject({ conversationId: 'c1', accountId: 'a1' })
      expect(list.find(person => person.slug === 'grace-hopper-demo')?.conversationId).toBeUndefined()
      expect(list.find(person => person.blocked)?.blocked).toBe('DO_NOT_CONTACT')
   })

   it('should take every account given, spread the invented people over them, and leave out groups', () => {
      const list = sampleRecipients(
         ['a1', 'a2'],
         [talking({ accountId: 'a2' }), talking({ id: 'g', kind: 'GROUP', accountId: 'a1' })],
         new Map(),
         ''
      )

      expect(list.find(person => person.name === 'Ada Byron')?.accountId).toBe('a2')
      expect(new Set(list.map(person => person.accountId))).toEqual(new Set(['a1', 'a2']))
      expect(sampleRecipients(['a3'], [talking()], new Map(), 'ada')).toEqual([])
   })

   it('should find a person by any word of the name or headline, without caring for case or accents', () => {
      const list = sampleRecipients(['a1'], [], new Map(), 'MATHEMATICIAN')

      expect(list.map(person => person.slug).sort()).toEqual(['alan-turing-demo', 'katherine-johnson-demo'])
      expect(sampleRecipients(['a1'], [], new Map(), 'zzzz')).toEqual([])
   })

   it('should treat a person written to from the page as talked to', () => {
      const list = sampleRecipients(['a1'], [], new Map([[startedKey('a1', 'alan-turing-demo'), 'sample-1']]), 'turing')

      expect(list).toEqual([expect.objectContaining({ slug: 'alan-turing-demo', conversationId: 'sample-1' })])
   })
})
