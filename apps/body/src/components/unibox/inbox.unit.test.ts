import { describe, expect, it } from 'vitest'

import { type UniboxAccount, type UniboxConversation, type UniboxMessage } from './types'

import { buildIndex, countsOf, filterRows, nextToReply, otherAccountsOf, sortRows, visibleViews } from './inbox'

const accounts: UniboxAccount[] = [
   { id: 'a1', name: 'Acme Sales', handle: 'sales@acme.test', headline: '', state: 'ACTIVE' },
   { id: 'a2', name: 'Beta Growth', handle: 'growth@beta.test', headline: '', state: 'ACTIVE' },
]

const message = (id: string, direction: 'ME' | 'THEM', at: number, text = 'hello'): UniboxMessage => ({
   id,
   direction,
   sender: 'x',
   at,
   when: '',
   text,
   attachments: [],
})

const conversation = (
   id: string,
   accountId: string,
   messages: UniboxMessage[],
   over: Partial<UniboxConversation> = {}
) =>
   ({
      id,
      accountId,
      contact: { name: `Person ${id}`, profileUrl: `https://www.linkedin.com/in/${id}/` },
      participants: [],
      kind: 'DIRECT',
      unread: false,
      complete: true,
      messages,
      ...over,
   }) satisfies UniboxConversation

const all = [
   conversation('c1', 'a1', [message('m1', 'THEM', 100, 'Kurze Frage zur Strategie')], { unread: true }),
   conversation('c2', 'a1', [message('m2', 'THEM', 50), message('m3', 'ME', 300)]),
   conversation('c3', 'a2', [message('m4', 'THEM', 400, 'Danke')], { doneAt: 500 }),
   conversation('c4', 'a2', [message('m5', 'ME', 10), message('m6', 'THEM', 20)], {
      failed: { reason: 'x', text: 't', attachments: [] },
   }),
   conversation('c5', 'a2', [message('m7', 'THEM', 5)]),
]

const index = buildIndex(accounts, all, new Set(['c5']))
const ids = (rows: ReturnType<typeof filterRows>) => rows.map(row => row.conversation.id)
const everyone = undefined

describe('filterRows', () => {
   it('should show every conversation of every account in All', () => {
      expect(ids(filterRows(index, { view: 'ALL', accountIds: everyone, query: '' }))).toEqual([
         'c1',
         'c2',
         'c3',
         'c4',
         'c5',
      ])
   })

   it('should show what needs a reply, what is unread, what was replied, drafts, failed and done', () => {
      const of = (view: Parameters<typeof filterRows>[1]['view']) =>
         ids(filterRows(index, { view, accountIds: everyone, query: '' }))

      expect(of('NEEDS_REPLY')).toEqual(['c1', 'c5'])
      expect(of('UNREAD')).toEqual(['c1'])
      expect(of('REPLIED')).toEqual(['c2'])
      expect(of('DRAFTS')).toEqual(['c5'])
      expect(of('FAILED')).toEqual(['c4'])
      expect(of('DONE')).toEqual(['c3'])
   })

   it('should keep to the accounts picked, and show nothing for an empty pick', () => {
      expect(ids(filterRows(index, { view: 'ALL', accountIds: new Set(['a2']), query: '' }))).toEqual([
         'c3',
         'c4',
         'c5',
      ])
      expect(ids(filterRows(index, { view: 'ALL', accountIds: new Set(), query: '' }))).toEqual([])
   })

   it('should search the message words, the contact and the account, all words needed', () => {
      const find = (query: string) => ids(filterRows(index, { view: 'ALL', accountIds: everyone, query }))

      expect(find('strategie')).toEqual(['c1'])
      expect(find('person c3')).toEqual(['c3'])
      expect(find('beta growth')).toEqual(['c3', 'c4', 'c5'])
      expect(find('strategie beta')).toEqual([])
   })

   it('should apply the view, the accounts and the search together', () => {
      expect(ids(filterRows(index, { view: 'NEEDS_REPLY', accountIds: new Set(['a2']), query: 'person' }))).toEqual([
         'c5',
      ])
   })
})

describe('countsOf', () => {
   it('should count every view for the accounts picked, whatever the search', () => {
      expect(countsOf(index, everyone)).toEqual({
         ALL: 5,
         NEEDS_REPLY: 2,
         UNREAD: 1,
         REPLIED: 1,
         DRAFTS: 1,
         FAILED: 1,
         DONE: 1,
      })
      expect(countsOf(index, new Set(['a1']))).toMatchObject({ ALL: 2, NEEDS_REPLY: 1, REPLIED: 1, DRAFTS: 0 })
   })
})

describe('visibleViews', () => {
   it('should always list the four main views, and the others only while they hold something', () => {
      expect(visibleViews(countsOf(index, everyone), 'ALL')).toEqual([
         'ALL',
         'NEEDS_REPLY',
         'UNREAD',
         'REPLIED',
         'DRAFTS',
         'FAILED',
         'DONE',
      ])
      expect(visibleViews(countsOf(index, new Set(['a1'])), 'ALL')).toEqual(['ALL', 'NEEDS_REPLY', 'UNREAD', 'REPLIED'])
   })

   it('should keep the view that is open even when it has become empty', () => {
      expect(visibleViews(countsOf(index, new Set(['a1'])), 'FAILED')).toEqual([
         'ALL',
         'NEEDS_REPLY',
         'UNREAD',
         'REPLIED',
         'FAILED',
      ])
   })
})

describe('sortRows', () => {
   const rows = filterRows(index, { view: 'ALL', accountIds: everyone, query: '' })

   it('should put the newest message first', () => {
      expect(ids(sortRows(rows, 'NEWEST'))).toEqual(['c3', 'c2', 'c1', 'c4', 'c5'])
   })

   it('should put what has waited longest first (a conversation closed as done is not waiting), then the rest by newest', () => {
      expect(ids(sortRows(rows, 'WAITING'))).toEqual(['c5', 'c4', 'c1', 'c3', 'c2'])
   })

   it('should not change the list it was given', () => {
      const before = ids(rows)

      sortRows(rows, 'NEWEST')

      expect(ids(rows)).toEqual(before)
   })
})

describe('otherAccountsOf', () => {
   const shared = buildIndex(
      accounts,
      [
         conversation('s1', 'a1', [message('x1', 'THEM', 1)], {
            contact: { name: 'Anna', profileUrl: 'https://www.linkedin.com/in/anna/' },
         }),
         conversation('s2', 'a2', [message('x2', 'ME', 2)], {
            contact: { name: 'Anna K', profileUrl: 'https://www.linkedin.com/in/anna/' },
         }),
         conversation('s3', 'a2', [message('x3', 'THEM', 3)], { contact: { name: 'Anna' } }),
         conversation('s4', 'a1', [message('x4', 'THEM', 4)], { contact: { name: 'Anna' } }),
      ],
      new Set()
   )

   it('should find the same person in the conversations of other accounts, by profile link', () => {
      const [first] = shared.rows

      expect(otherAccountsOf(shared, first!.conversation).map(other => other.conversation.id)).toEqual(['s2'])
   })

   it('should never match people by name alone', () => {
      const noLink = shared.byId.get('s3')!.conversation

      expect(otherAccountsOf(shared, noLink)).toEqual([])
   })
})

describe('nextToReply', () => {
   const rows = sortRows(filterRows(index, { view: 'ALL', accountIds: everyone, query: '' }), 'NEWEST')

   it('should give the next conversation that needs a reply, after the one open', () => {
      expect(nextToReply(rows, 'c3')).toBe('c1')
      expect(nextToReply(rows, 'c1')).toBe('c5')
   })

   it('should come round to the first when there is none after, and give nothing when none needs a reply', () => {
      expect(nextToReply(rows, 'c5')).toBe('c1')
      expect(
         nextToReply(
            rows.filter(row => row.status !== 'NEEDS_REPLY'),
            'c3'
         )
      ).toBeUndefined()
   })
})
