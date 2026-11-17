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

   it('should answer with a sentence, not a throw, when a page or a file is missing', () => {
      expect(pair(input, invites, ['no-connect-1.html'])).toEqual({ error: expect.stringContaining('2 people') })
      expect(pair('not json', invites, [])).toEqual({ error: expect.stringContaining('input.json') })
      expect(pair(input, '{}', [])).toEqual({ error: expect.stringContaining('invites.json') })
   })
})
