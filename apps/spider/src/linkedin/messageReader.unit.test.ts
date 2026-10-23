import { describe, expect, it } from 'vitest'

import { composerHtml, newestIsOurs, parseComposer, parseInbox, parseOwner, parseThread } from './messageReader'
import { inboxMarkup, threadMarkup } from './messagingFixture'

// Thursday, 22 October 2026.
const today = new Date(Date.UTC(2026, 9, 22, 12, 0, 0))
const ADA = 'https://www.linkedin.com/in/ada/'
const ME = 'https://www.linkedin.com/in/me/'

describe('parseThread', () => {
   const html = threadMarkup({
      title: 'Ada Lovelace',
      profile: ADA,
      messages: [
         {
            id: '2-m1',
            from: 'THEM',
            name: 'Ada Lovelace',
            profile: ADA,
            time: '5:18 PM',
            day: 'Jan 25, 2024',
            text: 'Hello Tripti,<br>quick &amp; short question',
         },
         {
            id: '2-m2',
            from: 'THEM',
            text: 'Second of the group',
         },
         {
            id: '2-m3',
            from: 'ME',
            name: 'Tripti Verma',
            profile: ME,
            time: '9:01 AM',
            day: 'Today',
            text: 'Thanks',
         },
         {
            id: '2-m4',
            from: 'THEM',
            name: 'Ada Lovelace',
            profile: ADA,
            time: '9:10 AM',
            image: 'plan.png',
            imageSrc: 'https://media.licdn.com/dms/image/plan?e=1&amp;t=x',
         },
      ],
   })

   it('should give the address of a picture of a message when LinkedIn serves it, and none for another host or no address', () => {
      const picture = (imageSrc?: string) =>
         parseThread(
            threadMarkup({
               title: 'Ada',
               profile: ADA,
               messages: [
                  {
                     id: '2-p',
                     from: 'THEM',
                     name: 'Ada',
                     profile: ADA,
                     time: '9:10 AM',
                     day: 'Today',
                     image: 'a.png',
                     imageSrc,
                  },
               ],
            }),
            today
         ).messages[0]?.attachments[0]

      expect(picture('https://media.licdn.com/dms/image/plan?e=1&amp;t=x')).toEqual({
         kind: 'IMAGE',
         name: 'a.png',
         url: 'https://media.licdn.com/dms/image/plan?e=1&t=x',
      })
      expect(picture('https://elsewhere.test/a.png')).toEqual({
         kind: 'IMAGE',
         name: 'a.png',
      })
      expect(picture('https://www.linkedin.com/dms/prv/image/v2/D4D06/messaging-image-720/B4Da?m=1&amp;t=x')).toEqual({
         kind: 'IMAGE',
         name: 'a.png',
         url: 'https://www.linkedin.com/dms/prv/image/v2/D4D06/messaging-image-720/B4Da?m=1&t=x',
      })
      expect(picture('https://www.linkedin.com/in/ada/a.png')).toEqual({
         kind: 'IMAGE',
         name: 'a.png',
      })
      expect(picture()).toEqual({
         kind: 'IMAGE',
         name: 'a.png',
      })
   })

   it("should give a person the profile picture the page draws for that name, from LinkedIn's image host only", () => {
      const photo = (name: string, src: string) => `<img class="presence-entity__image" alt="${name}" src="${src}">`
      const withPhotos = (...images: string[]) => parseThread(`${html}${images.join('')}`, today)

      const found = withPhotos(photo('Ada Lovelace', 'https://media.licdn.com/dms/image/ada'))

      expect(found.participants[0]).toMatchObject({ imageUrl: 'https://media.licdn.com/dms/image/ada' })
      expect(found.messages[0]?.sender.imageUrl).toBe('https://media.licdn.com/dms/image/ada')
      expect(withPhotos(photo('Ada Lovelace', 'https://elsewhere.test/ada.png')).participants[0]).not.toHaveProperty(
         'imageUrl'
      )
      expect(
         withPhotos(
            photo('Ada Lovelace', 'https://media.licdn.com/dms/image/one'),
            photo('Ada Lovelace', 'https://media.licdn.com/dms/image/two')
         ).participants[0]
      ).not.toHaveProperty('imageUrl')
   })

   it('should read each message with its id, sender, direction, day, time and text', () => {
      const { messages } = parseThread(html, today)

      expect(messages.map(message => message.id)).toEqual([
         'urn:li:msg_message:(urn:li:fsd_profile:me,2-m1)',
         'urn:li:msg_message:(urn:li:fsd_profile:me,2-m2)',
         'urn:li:msg_message:(urn:li:fsd_profile:me,2-m3)',
         'urn:li:msg_message:(urn:li:fsd_profile:me,2-m4)',
      ])
      expect(messages[0]).toMatchObject({
         sender: {
            name: 'Ada Lovelace',
            profileUrl: ADA,
         },
         direction: 'THEM',
         date: '2024-01-25',
         time: '17:18',
         when: 'Jan 25, 2024 5:18 PM',
         text: 'Hello Tripti,\nquick & short question',
      })
      expect(messages[2]).toMatchObject({
         sender: {
            name: 'Tripti Verma',
            profileUrl: ME,
         },
         direction: 'ME',
         date: '2026-10-22',
         time: '09:01',
      })
   })

   it('should give a message of a group the sender and the day of the group, and no time of its own', () => {
      const [, second] = parseThread(html, today).messages

      expect(second).toMatchObject({
         sender: {
            name: 'Ada Lovelace',
            profileUrl: ADA,
         },
         direction: 'THEM',
         date: '2024-01-25',
         when: 'Jan 25, 2024',
         text: 'Second of the group',
      })
      expect(second).not.toHaveProperty('time')
   })

   it('should note an image of a message that has no text, as a placeholder and never as the image', () => {
      const [, , , image] = parseThread(html, today).messages

      expect(image).toMatchObject({
         text: '',
         attachments: [
            {
               kind: 'IMAGE',
               name: 'plan.png',
            },
         ],
      })
   })

   it('should name the conversation and who is in it, and say it is direct when one person writes', () => {
      expect(parseThread(html, today)).toMatchObject({
         title: 'Ada Lovelace',
         kind: 'DIRECT',
         participants: [
            {
               name: 'Ada Lovelace',
               profileUrl: ADA,
            },
         ],
      })
   })

   it('should say it is a group when several people write, or the header has no profile', () => {
      const several = threadMarkup({
         title: 'Team',
         messages: [
            {
               id: '2-a',
               from: 'THEM',
               name: 'Ada',
               time: '1:00 PM',
               day: 'Mon',
               text: 'one',
            },
            {
               id: '2-b',
               from: 'THEM',
               name: 'Grace',
               time: '1:05 PM',
               text: 'two',
            },
         ],
      })
      const { kind, participants } = parseThread(several, today)

      expect(kind).toBe('GROUP')
      expect(participants.map(person => person.name)).toEqual(['Ada', 'Grace'])
   })

   it('should read a thread with no message, and a page with no thread at all', () => {
      expect(
         parseThread(
            threadMarkup({
               title: 'Empty',
               profile: ADA,
               messages: [],
            }),
            today
         ).messages
      ).toEqual([])
      expect(parseThread('<html><body><p>nothing</p></body></html>', today)).toMatchObject({
         title: '',
         messages: [],
      })
   })

   it('should keep the text as shown when the day cannot be understood', () => {
      const html2 = threadMarkup({
         title: 'Ada',
         profile: ADA,
         messages: [
            {
               id: '2-x',
               from: 'THEM',
               name: 'Ada',
               time: '5:18 PM',
               day: '25. Januar 2024',
               text: 'Hallo',
            },
         ],
      })
      const [only] = parseThread(html2, today).messages

      expect(only).toMatchObject({
         when: '25. Januar 2024 5:18 PM',
         time: '17:18',
      })
      expect(only).not.toHaveProperty('date')
   })
})

describe('parseOwner', () => {
   it('should read the name and picture of the account from the top bar, and nothing from a page without it', () => {
      const bar = (src: string) => `<nav><img class="global-nav__me-photo" alt=" Tripti Verma " src="${src}"></nav>`

      expect(parseOwner(bar('https://media.licdn.com/dms/image/me'))).toEqual({
         name: 'Tripti Verma',
         imageUrl: 'https://media.licdn.com/dms/image/me',
      })
      expect(parseOwner(bar('https://elsewhere.test/me.png'))).toEqual({ name: 'Tripti Verma' })
      expect(parseOwner('<nav></nav>')).toBeUndefined()
   })
})

describe('parseComposer', () => {
   const thread = (composer?: { typed?: string; sendDisabled?: boolean }) =>
      threadMarkup({
         title: 'Ada Lovelace',
         profile: ADA,
         messages: [],
         ...(composer && { composer }),
      })

   it('should find the place to write, what is typed in it and whether it can be sent', () => {
      expect(parseComposer(thread({}))).toEqual({
         present: true,
         typed: '',
         canSend: false,
      })
      expect(
         parseComposer(
            thread({
               typed: 'Hello &amp; thanks',
               sendDisabled: false,
            })
         )
      ).toEqual({
         present: true,
         typed: 'Hello & thanks',
         canSend: true,
      })
   })

   it('should say there is none on a page without one', () => {
      expect(parseComposer(thread())).toEqual({
         present: false,
         typed: '',
         canSend: false,
      })
      expect(parseComposer('<html><body></body></html>').present).toBe(false)
   })
})

describe('newestIsOurs', () => {
   const html = threadMarkup({
      title: 'Ada Lovelace',
      profile: ADA,
      messages: [
         {
            id: 'a',
            from: 'THEM',
            name: 'Ada Lovelace',
            profile: ADA,
            time: '9:00 AM',
            day: 'Today',
            text: 'Hi',
         },
         {
            id: 'b',
            from: 'ME',
            name: 'Tripti Verma',
            profile: ME,
            time: '9:05 AM',
            text: 'Sure,<br>tomorrow works',
         },
      ],
   })
   const { messages } = parseThread(html, today)

   it('should say yes when the newest message is ours and holds the words, whatever the spacing', () => {
      expect(newestIsOurs(messages, 'Sure,\ntomorrow  works')).toBe(true)
   })

   it('should say no for other words, for a message that is theirs, and for a conversation with none', () => {
      expect(newestIsOurs(messages, 'Sure')).toBe(false)
      expect(newestIsOurs(messages.slice(0, 1), 'Hi')).toBe(false)
      expect(newestIsOurs([], 'Hi')).toBe(false)
   })

   const [first, newest] = messages.map(({ id }) => id)

   it('should take any words of a new message of ours when none are asked for (a message of files only)', () => {
      expect(
         newestIsOurs(messages, '', {
            id: first,
            count: 1,
         })
      ).toBe(true)
      expect(
         newestIsOurs(messages.slice(0, 1), '', {
            id: first,
            count: 0,
         })
      ).toBe(false)
   })

   it('should not take the message that was already the newest before the send, even with the same words', () => {
      expect(
         newestIsOurs(messages, 'Sure,\ntomorrow works', {
            id: newest,
            count: 2,
         })
      ).toBe(false)
      expect(
         newestIsOurs(messages, 'Sure,\ntomorrow works', {
            id: first,
            count: 1,
         })
      ).toBe(true)
      // The same id with one more message above it means a new message got the same made-up id.
      expect(
         newestIsOurs(messages, 'Sure,\ntomorrow works', {
            id: newest,
            count: 1,
         })
      ).toBe(true)
   })
})

describe('composerHtml', () => {
   it('should give the form of the box with what is attached to it, and nothing on a page without one', () => {
      const page = (extra: string) =>
         threadMarkup({
            title: 'Ada Lovelace',
            profile: ADA,
            messages: [],
            composer: {
               typed: 'Hi',
               extra,
            },
         })

      expect(composerHtml(page('<div class="chip">a.pdf 40%</div>'))).toContain('a.pdf 40%')
      expect(composerHtml(page('<div class="chip">a.pdf 90%</div>'))).not.toBe(
         composerHtml(page('<div class="chip">a.pdf 40%</div>'))
      )
      expect(composerHtml('<html><body></body></html>')).toBe('')
   })
})

describe('parseInbox', () => {
   const html = inboxMarkup(
      [
         {
            title: 'Ada Lovelace',
            when: 'Jan 16',
            snippet: 'Ada: see you',
            unread: true,
         },
         {
            title: 'Grace Hopper, Alan Turing',
            when: 'Mon',
            snippet: 'Alan: ok',
         },
      ],
      true
   )

   it('should list the rows in order with who, when, the last words and whether they are unread', () => {
      expect(parseInbox(html).rows).toEqual([
         {
            title: 'Ada Lovelace',
            when: 'Jan 16',
            snippet: 'Ada: see you',
            unread: true,
            hydrated: true,
            linkIndex: 0,
         },
         {
            title: 'Grace Hopper, Alan Turing',
            when: 'Mon',
            snippet: 'Alan: ok',
            unread: false,
            hydrated: true,
            linkIndex: 1,
         },
      ])
   })

   it('should tell a row that is drawn from one the page keeps empty, and number the drawn ones for clicking', () => {
      const { rows } = parseInbox(
         inboxMarkup([
            {
               title: 'A',
               when: 'Jan 1',
               snippet: 'a',
               placeholder: true,
            },
            {
               title: 'B',
               when: 'Jan 2',
               snippet: 'b',
            },
            {
               title: 'C',
               when: 'Jan 3',
               snippet: 'c',
               placeholder: true,
            },
            {
               title: 'D',
               when: 'Jan 4',
               snippet: 'd',
            },
         ])
      )

      expect(rows.map(({ hydrated, linkIndex }) => [hydrated, linkIndex])).toEqual([
         [false, undefined],
         [true, 0],
         [false, undefined],
         [true, 1],
      ])
   })

   it('should say whether the page may hold more conversations than it shows', () => {
      expect(parseInbox(html).more).toBe(true)
      expect(parseInbox(inboxMarkup([])).more).toBe(false)
      expect(parseInbox(inboxMarkup([])).rows).toEqual([])
   })
})
