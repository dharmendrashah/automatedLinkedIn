import { describe, expect, it } from 'vitest'

import { inmailProfileMarkup } from './inmailFixture'
import { INMAIL_COMPOSER, INMAIL_SEND_BUTTON, INMAIL_SUBJECT_BOX } from './markup'
import { composerHtml, hasProfileMessage, parseInmailWindow, parseMessageWindow } from './messageReader'

describe('parseInmailWindow', () => {
   it('should read an open window for a free message: its person, its banner, its subject box, and a box that cannot send yet', () => {
      const window = parseInmailWindow(inmailProfileMarkup({ inmail: {} }))

      expect(window).toMatchObject({
         open: true,
         windows: 1,
         recipients: ['/in/ada-l/'],
         banner: 'free',
         hasSubject: true,
         composer: {
            present: true,
            typed: '',
            canSend: false,
         },
      })
   })

   it('should see words typed and a send button that has come alive', () => {
      const window = parseInmailWindow(
         inmailProfileMarkup({
            inmail: {
               composer: {
                  typed: 'Hello',
                  sendDisabled: false,
               },
            },
         })
      )

      expect(window.composer).toMatchObject({
         typed: 'Hello',
         canSend: true,
      })
   })

   it('should tell the banner of a free message from any other, and a window with none', () => {
      const banner = (text: string | null) =>
         parseInmailWindow(inmailProfileMarkup({ inmail: { banner: text } })).banner

      expect(banner('Free message |')).toBe('free')
      expect(banner(' Free message | ')).toBe('free')
      // Made up: what the page says when a credit is spent was never seen.
      expect(banner('3 InMail credits |')).toBe('other')
      expect(banner(null)).toBe('none')
   })

   it('should count the windows for a free message, and not take an ordinary conversation for one', () => {
      const ordinary = parseInmailWindow(inmailProfileMarkup({ ordinary: { title: 'Ada Lovelace' } }))

      expect(ordinary).toMatchObject({
         open: true,
         windows: 0,
         recipients: [],
         banner: 'none',
      })
      expect(parseInmailWindow(inmailProfileMarkup()).open).toBe(false)
      expect(
         parseInmailWindow(
            inmailProfileMarkup({
               inmail: {},
               extraWindow: { profile: '/in/other/' },
            })
         )
      ).toMatchObject({
         windows: 2,
         recipients: ['/in/ada-l/'],
      })
   })

   it('should say when the window has no subject box, and when the page has no Message link', () => {
      expect(parseInmailWindow(inmailProfileMarkup({ inmail: { subject: false } })).hasSubject).toBe(false)
      expect(hasProfileMessage(inmailProfileMarkup({ messageLink: false }))).toBe(false)
      expect(hasProfileMessage(inmailProfileMarkup())).toBe(true)
   })

   it('should hand over the form of the window to be watched while files upload', () => {
      const composer = { extra: '<div class="msg-form__attachment">a.pdf 40%</div>' }
      const html = inmailProfileMarkup({ inmail: { composer } })

      expect(
         composerHtml(
            html,
            '[data-view-name="message-overlay-conversation-bubble-item"].msg-overlay-conversation-bubble--inmail'
         )
      ).toContain('a.pdf 40%')
   })

   it('should read the window as a conversation once the message went, with the subject apart from the words', () => {
      const html = inmailProfileMarkup({
         ordinary: {
            title: 'Ada Lovelace',
            messages: [
               {
                  id: 'm1',
                  from: 'ME',
                  name: 'Tripti',
                  time: '12:52 AM',
                  day: 'Today',
                  subject: 'A subject',
                  text: 'The words',
               },
            ],
         },
      })
      const sent = parseMessageWindow(html, new Date('2026-11-03T12:00:00Z')).messages

      expect(sent.at(-1)).toMatchObject({
         direction: 'ME',
         text: 'The words',
      })
   })

   it('should have plain selectors for the window that match the markup', () => {
      for (const selector of [INMAIL_COMPOSER, INMAIL_SEND_BUTTON, INMAIL_SUBJECT_BOX]) {
         expect(selector).not.toMatch(/:visible|>>|:has-text/)
      }
   })
})
