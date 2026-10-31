import { describe, expect, it } from 'vitest'

import { inviteDialogMarkup, notesOutMarkup, profileMarkup, sentMarkup, withdrawDialogMarkup } from './inviteFixture'
import {
   moreButtons,
   parseInviteDialog,
   parseProfileActions,
   parseSentInvites,
   slugKey,
   withdrawConfirm,
} from './inviteReader'

// The page as the driver hands it: the document, then what its shadow roots hold.
const withWindow = (window: string) => `<html><body>${profileMarkup()}${window}</body></html>`

describe('parseProfileActions', () => {
   it("should find every copy of the person's own Connect link among the suggested people's and read the member number", () => {
      expect(parseProfileActions(profileMarkup(), 'ada-lovelace', 'Ada Lovelace')).toEqual({
         connects: [0, 1, 2],
         menu: [],
         memberId: '736436677',
         pending: false,
         drawn: true,
      })
      expect(parseProfileActions(profileMarkup(), 'grace-hopper', 'Grace Hopper').connects).toEqual([3])
   })

   it('should match a slug written percent-encoded or in another case', () => {
      const html = profileMarkup({
         slug: 'анастасия-34a1',
         name: 'Anastasia',
      })

      expect(parseProfileActions(html, encodeURIComponent('анастасия-34a1'), 'Anastasia').connects).toHaveLength(3)
      expect(slugKey('Ada-Lovelace')).toBe('ada-lovelace')
   })

   it('should say no Connect link when only suggested people have one, and never take their pending invite for this one', () => {
      expect(parseProfileActions(profileMarkup({ own: false }), 'ada-lovelace', 'Ada Lovelace')).toEqual({
         connects: [],
         menu: [],
         pending: false,
         drawn: true,
      })
   })

   it("should read Connect in the open More menu apart from the page's copies, and find the profile's own More buttons only", () => {
      const closed = profileMarkup({ own: false })
      const open = profileMarkup({
         own: false,
         menuOpen: true,
      })

      expect(moreButtons(closed)).toHaveLength(1)
      expect(parseProfileActions(open, 'ada-lovelace', 'Ada Lovelace')).toMatchObject({
         connects: [],
         menu: [2],
         memberId: '1011546170',
      })
      expect(
         parseProfileActions(
            profileMarkup({
               own: false,
               menuOpen: true,
               menuConnect: false,
            }),
            'ada-lovelace',
            'Ada Lovelace'
         ).menu
      ).toEqual([])
   })

   it("should read the person's own pending invite", () => {
      expect(
         parseProfileActions(
            profileMarkup({
               own: false,
               pending: true,
            }),
            'ada-lovelace',
            'Ada Lovelace'
         ).pending
      ).toBe(true)
   })

   it('should say not drawn for a page with no buttons yet', () => {
      expect(parseProfileActions('<main><h1>Ada</h1></main>', 'ada', 'Ada').drawn).toBe(false)
   })
})

describe('parseInviteDialog', () => {
   it('should find the two buttons of the window among every button of the page, by their words', () => {
      const html = withWindow(inviteDialogMarkup())
      const dialog = parseInviteDialog(html)

      expect(dialog).toMatchObject({
         open: true,
         noteBox: false,
         send: -1,
      })
      expect(dialog.addNote).toBeGreaterThan(0)
      expect(dialog.sendWithoutNote).toBe(dialog.addNote + 1)
   })

   it('should say no window on the profile alone, and find Send only next to the note box', () => {
      expect(parseInviteDialog(withWindow('')).open).toBe(false)

      const withBox = parseInviteDialog(withWindow(inviteDialogMarkup({ note: true })))

      expect(withBox.noteBox).toBe(true)
      expect(withBox.send).toBeGreaterThan(0)
      expect(withBox.sendDisabled).toBe(true)
      expect(
         parseInviteDialog(
            withWindow(
               inviteDialogMarkup({
                  note: true,
                  typed: true,
               })
            )
         ).sendDisabled
      ).toBe(false)
   })

   it('should read the email question and the limit notice, and see no note box behind an offer of Premium', () => {
      expect(parseInviteDialog(withWindow(inviteDialogMarkup({ email: true }))).emailNeeded).toBe(true)
      expect(parseInviteDialog(withWindow(inviteDialogMarkup({ limit: true }))).limitReached).toBe(true)
      expect(parseInviteDialog(withWindow(inviteDialogMarkup({ upsell: true })))).toMatchObject({
         noteBox: false,
         send: -1,
         addNote: -1,
      })
   })

   it('should read the Premium offer that replaces the note box once the free notes are used up, by its outlet or its words', () => {
      expect(parseInviteDialog(withWindow(notesOutMarkup()))).toMatchObject({
         open: false,
         noteBox: false,
         notesOut: true,
      })
      expect(parseInviteDialog(withWindow(notesOutMarkup({ words: false }))).notesOut).toBe(true)
      expect(parseInviteDialog(`<main><p>You’re out of free custom notes.</p></main>`).notesOut).toBe(true)
      expect(parseInviteDialog(withWindow(inviteDialogMarkup({ note: true }))).notesOut).toBe(false)
   })
})

describe('parseSentInvites', () => {
   it("should find the person's Withdraw button among all rows", () => {
      expect(parseSentInvites(sentMarkup(['grace-hopper', 'ada-lovelace']), 'ada-lovelace')).toEqual({
         rows: 2,
         withdraw: 1,
      })
      expect(parseSentInvites(sentMarkup(['grace-hopper']), 'ada-lovelace').withdraw).toBe(-1)
      expect(withdrawConfirm(withdrawDialogMarkup)).toBe(1)
   })
})
