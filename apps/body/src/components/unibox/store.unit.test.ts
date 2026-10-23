import { describe, expect, it } from 'vitest'

import { type UniboxConversation } from './types'

import { statusOf } from './status'
import { reduce } from './store'

const base = (over: Partial<UniboxConversation> = {}): UniboxConversation => ({
   id: 'c1',
   accountId: 'a1',
   contact: { name: 'Ada' },
   participants: [],
   kind: 'DIRECT',
   unread: true,
   complete: true,
   messages: [{ id: 'm1', direction: 'THEM', sender: 'Ada', at: 100, when: '', text: 'Hi', attachments: [] }],
   ...over,
})

const other = base({ id: 'c2' })
const start = [base(), other]
const of = (state: UniboxConversation[], id = 'c1') => state.find(conversation => conversation.id === id)!

describe('read and unread', () => {
   it('should mark conversations read and unread, and leave the rest alone', () => {
      const read = reduce(start, { type: 'READ', ids: ['c1'] })

      expect(of(read).unread).toBe(false)
      expect(of(read, 'c2').unread).toBe(true)
      expect(of(reduce(read, { type: 'UNREAD', ids: ['c1'] })).unread).toBe(true)
   })

   it('should not change what needs a reply when it is read', () => {
      expect(statusOf(of(reduce(start, { type: 'READ', ids: ['c1'] })))).toBe('NEEDS_REPLY')
   })
})

describe('done', () => {
   it('should close a conversation without a reply, and open it again on undo', () => {
      const done = reduce(start, { type: 'DONE', ids: ['c1'], now: 200 })

      expect(statusOf(of(done))).toBe('DONE')
      expect(statusOf(of(reduce(done, { type: 'UNDONE', ids: ['c1'] })))).toBe('NEEDS_REPLY')
   })

   it('should bring a done conversation back when they write again', () => {
      const done = reduce(start, { type: 'DONE', ids: ['c1'], now: 200 })
      const again = reduce(done, {
         type: 'RECEIVE',
         id: 'c1',
         message: { id: 'm2', direction: 'THEM', sender: 'Ada', at: 300, when: '', text: 'Hello?', attachments: [] },
      })

      expect(statusOf(of(again))).toBe('NEEDS_REPLY')
      expect(of(again).unread).toBe(true)
   })
})

describe('send', () => {
   const sending = reduce(start, { type: 'SEND', id: 'c1', text: ' Thanks ', attachments: [], now: 1000 })

   it('should show the reply as being sent, not yet in the conversation', () => {
      expect(statusOf(of(sending))).toBe('REPLYING')
      expect(of(sending).messages).toHaveLength(1)
   })

   it('should take it back on undo', () => {
      const undone = reduce(sending, { type: 'UNDO_SEND', id: 'c1' })

      expect(statusOf(of(undone))).toBe('NEEDS_REPLY')
      expect(of(undone).sending).toBeUndefined()
   })

   it('should put it in the conversation as ours once sent, and read it, so the conversation is replied', () => {
      const sent = reduce(sending, { type: 'SENT', id: 'c1', now: 6000 })
      const last = of(sent).messages.at(-1)

      expect(statusOf(of(sent))).toBe('REPLIED')
      expect(last).toMatchObject({ direction: 'ME', text: 'Thanks', at: 6000 })
      expect(of(sent).unread).toBe(false)
   })

   it('should keep the reply when it fails, so it can be sent again, and clear it once sent', () => {
      const failed = reduce(sending, { type: 'FAIL', id: 'c1', reason: 'The account is not signed in.' })

      expect(statusOf(of(failed))).toBe('FAILED')
      expect(of(failed).failed).toMatchObject({ reason: 'The account is not signed in.', text: 'Thanks' })

      const retry = reduce(failed, {
         type: 'SEND',
         id: 'c1',
         text: of(failed).failed!.text,
         attachments: [],
         now: 7000,
      })

      expect(statusOf(of(retry))).toBe('REPLYING')
      expect(of(retry).failed).toBeUndefined()
      expect(statusOf(of(reduce(failed, { type: 'DISMISS_FAILED', id: 'c1' })))).toBe('NEEDS_REPLY')
   })

   it('should send once when asked twice, and refuse an empty reply', () => {
      const twice = reduce(sending, { type: 'SEND', id: 'c1', text: 'again', attachments: [], now: 1100 })

      expect(of(twice).sending?.text).toBe('Thanks')
      expect(reduce(start, { type: 'SEND', id: 'c1', text: '   ', attachments: [], now: 1 })).toBe(start)
   })

   it('should send a reply that is only an attachment', () => {
      const withFile = reduce(start, {
         type: 'SEND',
         id: 'c1',
         text: '',
         attachments: [{ kind: 'FILE', name: 'plan.pdf' }],
         now: 1,
      })
      const sent = reduce(withFile, { type: 'SENT', id: 'c1', now: 2 })

      expect(of(sent).messages.at(-1)?.attachments).toEqual([{ kind: 'FILE', name: 'plan.pdf' }])
   })

   it('should ignore an action for a conversation that is not there', () => {
      expect(reduce(start, { type: 'SENT', id: 'zzz', now: 1 })).toEqual(start)
   })
})
