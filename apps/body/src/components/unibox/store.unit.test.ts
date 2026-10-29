import { describe, expect, it } from 'vitest'

import { type UniboxConversation } from './types'

import { draftConversation } from './newMessage'
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

   it('should keep how much of the files is uploaded while it is sent, change nothing for the same percent, and ignore a reply not being sent', () => {
      const half = reduce(sending, { type: 'PROGRESS', id: 'c1', percent: 50 })

      expect(of(half).sending?.progress).toBe(50)
      expect(reduce(half, { type: 'PROGRESS', id: 'c1', percent: 50 })).toBe(half)
      expect(reduce(start, { type: 'PROGRESS', id: 'c1', percent: 50 })).toBe(start)
   })

   it('should say the reply is on its way, with its id and from when, and keep the id if it fails', () => {
      const started = reduce(sending, { type: 'STARTED', id: 'c1', replyId: 'r1', since: 5000 })

      expect(of(started).sending).toMatchObject({ replyId: 'r1', since: 5000 })
      expect(reduce(start, { type: 'STARTED', id: 'c1', replyId: 'r1', since: 1 })).toBe(start)
      expect(of(reduce(started, { type: 'FAIL', id: 'c1', reason: 'No.' })).failed).toMatchObject({ replyId: 'r1' })
   })

   it('should keep why a queued reply waits and until when, change nothing for the same wait, and drop it once the reply starts', () => {
      const started = reduce(sending, { type: 'STARTED', id: 'c1', replyId: 'r1', since: 5000 })
      const wait = {
         reason: "Waiting for the account's next slot.",
         until: '2026-10-28T17:53:00.000Z',
         zone: null,
      }
      const waiting = reduce(started, { type: 'WAITING', id: 'c1', wait })

      expect(of(waiting).sending?.wait).toEqual(wait)
      expect(reduce(waiting, { type: 'WAITING', id: 'c1', wait: { ...wait } })).toBe(waiting)
      expect(of(reduce(waiting, { type: 'WAITING', id: 'c1', wait: undefined })).sending).not.toHaveProperty('wait')
      expect(reduce(start, { type: 'WAITING', id: 'c1', wait })).toBe(start)
   })

   it('should keep the reply as it is when LinkedIn took it, marked done and read, until its message is stored', () => {
      const sent = reduce(sending, { type: 'SENT', id: 'c1' })

      expect(statusOf(of(sent))).toBe('REPLYING')
      expect(of(sent).sending).toMatchObject({ done: true, text: 'Thanks' })
      expect(of(sent).messages).toHaveLength(1)
      expect(of(sent).unread).toBe(false)
      expect(reduce(sent, { type: 'SENT', id: 'c1' })).toBe(sent)
   })

   it('should drop the reply once its stored message is there, and show it as ours when the message did not come', () => {
      const sent = reduce(sending, { type: 'SENT', id: 'c1' })
      const stored = reduce(sent, { type: 'FINISHED', id: 'c1', now: 6000, stored: true })
      const gaveUp = reduce(sent, { type: 'FINISHED', id: 'c1', now: 6000, stored: false })

      expect(of(stored).sending).toBeUndefined()
      expect(of(stored).messages).toHaveLength(1)
      expect(of(gaveUp).sending).toBeUndefined()
      expect(of(gaveUp).messages.at(-1)).toMatchObject({ direction: 'ME', text: 'Thanks', at: 6000 })
      expect(statusOf(of(gaveUp))).toBe('REPLIED')
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

   it('should remember that a reply may have been sent, so sending it again can ask first', () => {
      const unsure = reduce(sending, { type: 'FAIL', id: 'c1', reason: 'LinkedIn did not show it.', unsure: true })

      expect(of(unsure).failed).toMatchObject({ unsure: true })
      expect(of(reduce(sending, { type: 'FAIL', id: 'c1', reason: 'No.' })).failed?.unsure).toBeUndefined()
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
      const sent = reduce(withFile, { type: 'FINISHED', id: 'c1', now: 2, stored: false })

      expect(of(sent).messages.at(-1)?.attachments).toEqual([{ kind: 'FILE', name: 'plan.pdf' }])
   })

   it('should ignore an action for a conversation that is not there', () => {
      expect(reduce(start, { type: 'SENT', id: 'zzz' })).toEqual(start)
   })
})

describe('opened', () => {
   it('should put the whole conversation in place of the latest messages, and keep the owner marks and the other conversations', () => {
      const latest = base({ messageCount: 3, unread: false, doneAt: 5, waitingSince: 90 })
      const whole = base({
         complete: true,
         messageCount: 3,
         messages: [
            { id: 'm0', direction: 'ME', sender: 'Me', at: 50, when: '', text: 'First', attachments: [] },
            { id: 'm1', direction: 'THEM', sender: 'Ada', at: 100, when: '', text: 'Hi', attachments: [] },
            { id: 'm2', direction: 'THEM', sender: 'Ada', at: 110, when: '', text: 'Again', attachments: [] },
         ],
      })
      const next = reduce([latest, other], { type: 'OPENED', id: 'c1', conversation: whole })

      expect(of(next).messages.map(message => message.id)).toEqual(['m0', 'm1', 'm2'])
      expect(of(next)).toMatchObject({ unread: false, doneAt: 5, waitingSince: 90, messageCount: 3 })
      expect(of(next, 'c2')).toBe(other)
   })
})

describe('a first message', () => {
   const stand = draftConversation(
      { id: 'a1', name: 'Me', handle: 'me@x.test', headline: '', state: 'ACTIVE' },
      { accountId: 'a1', slug: 'grace-h', name: 'Grace', headline: '' }
   )
   const opened = reduce(start, { type: 'START', conversation: stand })
   const started = reduce(opened, { type: 'SEND', id: stand.id, text: 'Hello', attachments: [], now: 10 })

   it('should enter the list once, and be sent like a reply', () => {
      expect(opened).toHaveLength(3)
      expect(reduce(opened, { type: 'START', conversation: stand })).toBe(opened)
      expect(of(started, stand.id).sending?.text).toBe('Hello')
   })

   it('should stay open when its message is taken back or its failure dismissed', () => {
      expect(of(reduce(started, { type: 'UNDO_SEND', id: stand.id }), stand.id).sending).toBeUndefined()

      const failed = reduce(started, { type: 'FAIL', id: stand.id, reason: 'No.' })

      expect(statusOf(of(failed, stand.id))).toBe('FAILED')
      expect(of(reduce(failed, { type: 'DISMISS_FAILED', id: stand.id }), stand.id).failed).toBeUndefined()
   })

   it('should go when left with nothing in it, and only then', () => {
      expect(reduce(opened, { type: 'DISCARD', id: stand.id })).toEqual(start)
      expect(reduce(started, { type: 'DISCARD', id: stand.id })).toBe(started)
      expect(reduce(start, { type: 'DISCARD', id: 'c1' })).toBe(start)
   })

   it('should be sent again from a failure, as a reply is', () => {
      const failed = reduce(started, { type: 'FAIL', id: stand.id, reason: 'No.' })
      const again = reduce(failed, { type: 'SEND', id: stand.id, text: 'Hello', attachments: [], now: 20 })

      expect(statusOf(of(again, stand.id))).toBe('REPLYING')
   })

   it('should give way to the stored conversation, also when a reload already brought it', () => {
      const real = base({ id: 'real', messages: [] })
      const replaced = reduce(started, { type: 'REPLACE', id: stand.id, conversation: real })

      expect(replaced.map(conversation => conversation.id)).toEqual(['real', 'c1', 'c2'])
      expect(reduce([...started, real], { type: 'REPLACE', id: stand.id, conversation: real })).toHaveLength(3)
   })
})
