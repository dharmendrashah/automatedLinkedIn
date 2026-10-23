import { describe, expect, it } from 'vitest'

import { type UniboxConversation, type UniboxMessage } from './types'

import { lastMessage, lastReplyAt, previewOf, statusOf, waitingSince } from './status'

const message = (
   id: string,
   direction: 'ME' | 'THEM',
   at: number,
   text = 'hello',
   attachments: UniboxMessage['attachments'] = []
) =>
   ({
      id,
      direction,
      sender: direction === 'ME' ? 'Me' : 'Ada',
      at,
      when: '',
      text,
      attachments,
   }) satisfies UniboxMessage

const conversation = (messages: UniboxMessage[], over: Partial<UniboxConversation> = {}): UniboxConversation => ({
   id: 'c1',
   accountId: 'a1',
   contact: { name: 'Ada' },
   participants: [{ name: 'Ada' }],
   kind: 'DIRECT',
   unread: false,
   complete: true,
   messages,
   ...over,
})

describe('statusOf', () => {
   it('should say needs reply when the last message is theirs, and replied when it is ours', () => {
      expect(statusOf(conversation([message('1', 'ME', 1), message('2', 'THEM', 2)]))).toBe('NEEDS_REPLY')
      expect(statusOf(conversation([message('1', 'THEM', 1), message('2', 'ME', 2)]))).toBe('REPLIED')
   })

   it('should say none for a conversation with no message', () => {
      expect(statusOf(conversation([]))).toBe('NONE')
   })

   it('should say done until a newer message arrives, which brings it back', () => {
      const messages = [message('1', 'THEM', 10)]

      expect(statusOf(conversation(messages, { doneAt: 20 }))).toBe('DONE')
      expect(statusOf(conversation([...messages, message('2', 'THEM', 30)], { doneAt: 20 }))).toBe('NEEDS_REPLY')
   })

   it('should not call a conversation done when it was replied to', () => {
      expect(statusOf(conversation([message('1', 'ME', 10)], { doneAt: 20 }))).toBe('REPLIED')
   })

   it('should say replying while a reply is being sent, and failed when it did not go, before anything else', () => {
      const messages = [message('1', 'THEM', 1)]
      const sending = { text: 'x', attachments: [], at: 5 }
      const failed = { reason: 'no', text: 'x', attachments: [] }

      expect(statusOf(conversation(messages, { sending, doneAt: 3 }))).toBe('REPLYING')
      expect(statusOf(conversation(messages, { failed }))).toBe('FAILED')
   })
})

describe('lastReplyAt and waitingSince', () => {
   const messages = [
      message('1', 'THEM', 100),
      message('2', 'ME', 200),
      message('3', 'THEM', 300),
      message('4', 'THEM', 400),
   ]

   it('should give the time of the newest message we sent, or nothing when we never replied', () => {
      expect(lastReplyAt(conversation(messages))).toBe(200)
      expect(lastReplyAt(conversation([message('1', 'THEM', 1)]))).toBeUndefined()
   })

   it('should say since when they have waited: their first message after our last', () => {
      expect(waitingSince(conversation(messages))).toBe(300)
      expect(waitingSince(conversation([message('1', 'THEM', 100), message('2', 'THEM', 150)]))).toBe(100)
      expect(waitingSince(conversation([message('1', 'THEM', 100), message('2', 'ME', 150)]))).toBeUndefined()
   })
})

describe('previewOf', () => {
   it('should give the last words on one line, and who wrote them', () => {
      expect(previewOf(conversation([message('1', 'THEM', 1, 'Hello\n  there   Ada')]))).toEqual({
         from: 'THEM',
         text: 'Hello there Ada',
      })
   })

   it('should say what a message without words holds', () => {
      const only = (attachments: UniboxMessage['attachments']) =>
         previewOf(conversation([message('1', 'THEM', 1, '', attachments)])).text

      expect(only([{ kind: 'IMAGE' }])).toBe('[Image]')
      expect(only([{ kind: 'FILE', name: 'plan.pdf' }])).toBe('[File: plan.pdf]')
      expect(only([{ kind: 'AUDIO' }])).toBe('[Voice note]')
      expect(only([{ kind: 'VIDEO' }])).toBe('[Video]')
      expect(only([])).toBe('')
   })

   it('should give nothing for an empty conversation', () => {
      expect(previewOf(conversation([]))).toEqual({ from: 'THEM', text: '' })
      expect(lastMessage(conversation([]))).toBeUndefined()
   })
})
