import { describe, expect, it } from 'vitest'

import { profileMarkup } from '../linkedin/inviteFixture'
import { checkPages, pair } from './invitePages'

const PERSON = {
   slug: 'ada-lovelace',
   name: 'Ada Lovelace',
}

describe('checkPages', () => {
   it('should count the controls the readers find on each page', () => {
      const rows = checkPages(
         [
            {
               name: 'own.html',
               html: profileMarkup(),
            },
            {
               name: 'icon.html',
               html: profileMarkup({
                  own: false,
                  more: 'icon',
               }),
            },
            {
               name: 'text.html',
               html: profileMarkup({
                  own: false,
                  more: 'text',
               }),
            },
         ],
         [PERSON, PERSON, PERSON]
      )

      expect(rows[0]).toMatchObject({
         page: 'own.html',
         drawn: true,
      })
      expect(rows[0]?.connects).toBeGreaterThan(0)
      expect(rows[1]).toMatchObject({
         more: 1,
         connects: 0,
         drawn: true,
      })
      expect(rows[2]).toMatchObject({
         more: 1,
         connects: 0,
      })
   })

   it('should say a page that is not a profile did not draw', () => {
      expect(
         checkPages(
            [
               {
                  name: 'x.html',
                  html: '<main><p>Loading</p></main>',
               },
            ],
            [PERSON]
         )[0]
      ).toMatchObject({
         drawn: false,
         more: 0,
      })
   })

   it('should leave a page without a person when there are more pages than people', () => {
      const rows = checkPages(
         [
            {
               name: 'a.html',
               html: profileMarkup(),
            },
            {
               name: 'b.html',
               html: profileMarkup(),
            },
         ],
         [PERSON]
      )

      expect(rows.map(({ slug }) => slug)).toEqual([PERSON.slug, ''])
   })

   it('should see Pending and the Connect in an open menu', () => {
      expect(
         checkPages(
            [
               {
                  name: 'p.html',
                  html: profileMarkup({
                     own: false,
                     pending: true,
                  }),
               },
            ],
            [PERSON]
         )[0]
      ).toMatchObject({ pending: true })
      expect(
         checkPages(
            [
               {
                  name: 'm.html',
                  html: profileMarkup({
                     own: false,
                     menuOpen: true,
                  }),
               },
            ],
            [PERSON]
         )[0]
      ).toMatchObject({
         connects: 0,
         menu: 1,
      })
   })

   it('should read a page that has no person by its Connect links only', () => {
      expect(
         checkPages(
            [
               {
                  name: 'y.html',
                  html: profileMarkup({ own: false }),
               },
            ],
            []
         )[0]
      ).toMatchObject({
         page: 'y.html',
         slug: '',
         more: 1,
      })
   })
})

describe('pair', () => {
   const input = JSON.stringify({
      send: [
         {
            id: 'a',
            slug: 'one',
            name: 'One',
         },
         {
            id: 'b',
            slug: 'two',
            name: 'Two',
         },
         {
            id: 'c',
            slug: 'three',
            name: 'Three',
         },
      ],
   })
   const invites = JSON.stringify({
      sent: [
         {
            id: 'a',
            outcome: 'NO_CONNECT',
         },
         {
            id: 'b',
            outcome: 'SENT',
         },
         {
            id: 'c',
            outcome: 'NO_CONNECT',
         },
      ],
   })

   it('should match the no-Connect people to the kept pages in order', () => {
      expect(pair(input, invites, ['no-connect-2.html', 'no-connect-1.html'])).toEqual({
         people: [
            {
               slug: 'one',
               name: 'One',
            },
            {
               slug: 'three',
               name: 'Three',
            },
         ],
         pages: ['no-connect-1.html', 'no-connect-2.html'],
      })
   })

   it('should order the kept pages by their number, not by their letters, and ignore other files', () => {
      const many = Array.from({ length: 10 }, (_, at) => ({
         id: `p${at}`,
         slug: `s${at}`,
         name: `N${at}`,
      }))
      const result = pair(
         JSON.stringify({ send: many }),
         JSON.stringify({
            sent: many.map(({ id }) => ({
               id,
               outcome: 'NO_CONNECT',
            })),
         }),
         [...Array.from({ length: 10 }, (_, at) => `no-connect-${at + 1}.html`), 'video.webm', 'notes.html'].reverse()
      )

      expect(result).toMatchObject({ pages: Array.from({ length: 10 }, (_, at) => `no-connect-${at + 1}.html`) })
   })

   it('should skip an answer whose person is not in the input, and take a missing name as empty', () => {
      expect(
         pair(
            JSON.stringify({
               send: [
                  {
                     id: 'a',
                     slug: 'one',
                  },
               ],
            }),
            JSON.stringify({
               sent: [
                  {
                     id: 'ghost',
                     outcome: 'NO_CONNECT',
                  },
                  {
                     id: 'a',
                     outcome: 'NO_CONNECT',
                  },
               ],
            }),
            ['no-connect-1.html']
         )
      ).toEqual({
         people: [
            {
               slug: 'one',
               name: '',
            },
         ],
         pages: ['no-connect-1.html'],
      })
   })

   it('should pair nothing when no answer was no Connect and no page was kept', () => {
      expect(
         pair(
            input,
            JSON.stringify({
               sent: [
                  {
                     id: 'a',
                     outcome: 'SENT',
                  },
               ],
            }),
            []
         )
      ).toEqual({
         people: [],
         pages: [],
      })
   })

   it('should answer with a sentence, not a throw, when a page or a file is missing', () => {
      expect(pair(input, invites, ['no-connect-1.html'])).toEqual({ error: expect.stringContaining('2 people') })
      expect(pair('not json', invites, [])).toEqual({ error: expect.stringContaining('input.json') })
      expect(pair(input, '{}', [])).toEqual({ error: expect.stringContaining('invites.json') })
   })
})
