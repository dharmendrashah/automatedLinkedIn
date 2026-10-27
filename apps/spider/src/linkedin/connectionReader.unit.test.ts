import { describe, expect, it } from 'vitest'

import { type FixtureConnection, connectionRow, connectionsPage } from './connectionFixture'
import { parseConnections } from './connectionReader'

const person = (index: number, extra: Partial<FixtureConnection> = {}): FixtureConnection => ({
   slug: `person-${index}`,
   name: `Person Number${index}`,
   headline: `Works at Company ${index}`,
   ...extra,
})

describe('parseConnections', () => {
   it('should read each connection: address, name, headline, the day they connected, picture and number', () => {
      const page = parseConnections(
         connectionsPage(
            [
               person(1, {
                  photo: 'https://media.licdn.com/dms/image/v2/fixture/profile-displayphoto',
                  urn: 'ACoAAone',
               }),
               person(2),
            ],
            { total: 115 }
         )
      )

      expect(page).toMatchObject({
         rows: 2,
         total: 115,
         empty: false,
      })
      expect(page.connections).toEqual([
         {
            slug: 'person-1',
            name: 'Person Number1',
            headline: 'Works at Company 1',
            connectedOn: '2026-10-27',
            photoUrl: 'https://media.licdn.com/dms/image/v2/fixture/profile-displayphoto',
            messageUrn: 'urn:li:fsd_profile:ACoAAone',
         },
         {
            slug: 'person-2',
            name: 'Person Number2',
            headline: 'Works at Company 2',
            connectedOn: '2026-10-27',
            messageUrn: 'urn:li:fsd_profile:ACoAAfixture',
         },
      ])
   })

   it('should leave out what a row does not show: the headline, a day it cannot read, the Message link, a picture that is not LinkedIn’s', () => {
      const [bare] = parseConnections(
         connectionsPage([
            person(1, {
               headline: undefined,
               connected: 'Connected 2 weeks ago',
               noMessage: true,
               photo: 'data:image/gif;base64,AAAA',
            }),
         ])
      ).connections

      expect(bare).toEqual({
         slug: 'person-1',
         name: 'Person Number1',
         headline: '',
      })
   })

   it('should read a row of the layout with no data-view-name, as the recorded page of 2026-10-27 was made', () => {
      const page = parseConnections(
         connectionsPage(
            [
               person(1, {
                  plain: true,
                  urn: 'ACoAAplain',
               }),
            ],
            { total: 114 }
         )
      )

      expect(page.total).toBe(114)
      expect(page.connections).toEqual([
         {
            slug: 'person-1',
            name: 'Person Number1',
            headline: 'Works at Company 1',
            connectedOn: '2026-10-27',
            messageUrn: 'urn:li:fsd_profile:ACoAAplain',
         },
      ])
   })

   it('should keep a slug as the page writes it, percent signs included, and read each person once', () => {
      const page = parseConnections(
         connectionsPage([
            person(1, { slug: 'ann%C3%A9-lee-1a2b3c' }),
            person(1, { slug: 'ann%C3%A9-lee-1a2b3c' }),
            person(2, { batch: 10 }),
         ])
      )

      expect(page.connections.map(({ slug }) => slug)).toEqual(['ann%C3%A9-lee-1a2b3c', 'person-2'])
   })

   it('should count a row it cannot read, so the read is known not to be complete', () => {
      const unreadable = connectionRow(person(1)).replace(/<p>Person Number1<\/p>/, '<p></p>')
      const page = parseConnections(`<html><body><div data-testid="lazy-column">${unreadable}</div></body></html>`)

      expect(page.rows).toBe(1)
      expect(page.connections).toEqual([])
   })

   it('should say the list is empty only when the page says it has none', () => {
      expect(parseConnections(connectionsPage([], { total: 0 }))).toMatchObject({
         rows: 0,
         total: 0,
         empty: true,
      })
      expect(parseConnections(connectionsPage([]))).toMatchObject({
         rows: 0,
         empty: false,
      })
      expect(parseConnections('<html><body></body></html>').total).toBeUndefined()
   })

   it('should read a heading with one connection in the singular, and ignore a heading that is not a count', () => {
      expect(parseConnections(connectionsPage([person(1)], { total: 1 })).total).toBe(1)
      expect(parseConnections(connectionsPage([person(1)]).replace('<p>Sort by:</p>', '<p>12 stars</p>')).total).toBe(
         undefined
      )
   })
})
