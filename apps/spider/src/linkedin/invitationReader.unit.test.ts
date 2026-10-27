import { describe, expect, it } from 'vitest'

import { invitationRow, invitationsPage } from './invitationFixture'
import { parseInvitations } from './invitationReader'

const ADA = {
   id: '7520752930702983168',
   slug: 'ada-lovelace',
   name: 'Ada Lovelace',
   headline: 'Mathematician at Analytical Engines',
   mutual: 'Charles Babbage is a mutual connection',
   photo: 'https://media.licdn.com/dms/image/v2/fixture/profile-displayphoto-ada',
}
const GRACE = {
   id: '7500478553684242432',
   slug: 'grace-hopper-1',
   name: 'Grace Hopper',
   headline: 'Rear Admiral',
}

describe('parseInvitations', () => {
   it('should read who asked, their headline, the mutual line and the picture of a request', () => {
      const { invitations } = parseInvitations(invitationsPage([ADA]))

      expect(invitations).toEqual([
         {
            id: ADA.id,
            slug: 'ada-lovelace',
            name: 'Ada Lovelace',
            headline: 'Mathematician at Analytical Engines',
            mutual: 'Charles Babbage is a mutual connection',
            photoUrl: ADA.photo,
         },
      ])
   })

   it('should leave out what a request does not have, in the order the page lists them', () => {
      const { invitations } = parseInvitations(invitationsPage([GRACE, ADA]))

      expect(invitations.map(({ id }) => id)).toEqual([GRACE.id, ADA.id])
      expect(invitations[0]).toEqual({
         id: GRACE.id,
         slug: 'grace-hopper-1',
         name: 'Grace Hopper',
         headline: 'Rear Admiral',
      })
   })

   it('should read the name without the badge LinkedIn draws next to it', () => {
      const { invitations } = parseInvitations(
         invitationsPage([
            {
               ...GRACE,
               badge: 'Premium',
            },
         ])
      )

      expect(invitations[0]?.name).toBe('Grace Hopper')
   })

   it('should read the sender note whole, without its show more button or the reply link', () => {
      const { invitations } = parseInvitations(
         invitationsPage([
            {
               ...GRACE,
               note: ['Hi Tripti', 'we met at the fair', 'Best', 'Grace'],
            },
         ])
      )

      expect(invitations[0]?.note).toBe('Hi Tripti\nwe met at the fair\nBest\nGrace')
      expect(invitations[0]?.headline).toBe('Rear Admiral')
   })

   it('should read the number LinkedIn gives for all the requests from the All chip', () => {
      expect(parseInvitations(invitationsPage([ADA], { all: 8 })).total).toBe(8)
      expect(parseInvitations(invitationsPage([ADA], { all: 0 })).total).toBe(0)
      expect(parseInvitations(invitationsPage([ADA])).total).toBeUndefined()
      expect(parseInvitations('<div><button><span>Verified (3)</span></button></div>').total).toBeUndefined()
   })

   it('should count a row it cannot read, so a read is not taken for complete', () => {
      const { invitations, rows } = parseInvitations(
         `<div>${invitationRow(ADA)}${invitationRow({
            ...GRACE,
            nameless: true,
         })}</div>`
      )

      expect(rows).toBe(2)
      expect(invitations.map(({ id }) => id)).toEqual([ADA.id])
   })

   it('should keep a request once even when the page draws it twice', () => {
      const { invitations, rows } = parseInvitations(`<div>${invitationRow(ADA)}${invitationRow(ADA)}</div>`)

      expect(invitations).toHaveLength(1)
      expect(rows).toBe(2)
   })

   it('should take only a picture served by LinkedIn over https', () => {
      const { invitations } = parseInvitations(
         invitationsPage([
            {
               ...ADA,
               photo: 'data:image/gif;base64,AAAA',
            },
         ])
      )

      expect(invitations[0]?.photoUrl).toBeUndefined()
   })

   it('should find nothing on a page that draws no request and does not say there are none', () => {
      expect(parseInvitations('<html><body><button><span>All (0)</span></button></body></html>')).toEqual({
         invitations: [],
         rows: 0,
         empty: false,
         total: 0,
      })
   })

   it('should take the list’s own words as an empty list, and not the suggestions under it for requests', () => {
      const suggestions =
         '<div role="listitem" componentkey="auto-component-3c918c5a"><a href="https://www.linkedin.com/in/someone/">Someone</a></div>'

      expect(
         parseInvitations(
            invitationsPage([], {
               none: true,
               extra: suggestions,
            })
         )
      ).toMatchObject({
         invitations: [],
         rows: 0,
         empty: true,
      })
      expect(parseInvitations(invitationsPage([ADA], { none: true })).empty).toBe(false)
      expect(parseInvitations('<div><p>No new invitations</p></div>').empty).toBe(false)
   })
})
