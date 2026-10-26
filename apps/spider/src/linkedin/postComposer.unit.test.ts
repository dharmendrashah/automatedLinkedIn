import { describe, expect, it } from 'vitest'

import { parsePostComposer, parsePostOptions, parsePostResult } from './postComposer'
import { composerMarkup, feedMarkup, postedMarkup } from './postFixture'

const ACTIVITY = 'https://www.linkedin.com/feed/update/urn:li:activity:7520195721216827392/'
const SHARE = 'https://www.linkedin.com/feed/update/urn:li:share:7520195720021266433/'

describe('parsePostComposer', () => {
   it('should find the box, read the audience, and say Post can be pressed once something is typed', () => {
      expect(parsePostComposer(composerMarkup({ typed: ['Hello'] }))).toEqual({
         present: true,
         audience: 'Connections only',
         comments: 'Anyone',
         typed: 'Hello',
         attachment: false,
         canPost: true,
         busy: false,
         postIndex: -1,
      })
   })

   it('should read an empty box as no words and a greyed Post button as one that cannot be pressed', () => {
      expect(parsePostComposer(composerMarkup({ disabled: true }))).toMatchObject({
         present: true,
         typed: '',
         canPost: false,
         busy: false,
      })
   })

   it('should read the paragraphs of the box one after the other', () => {
      expect(parsePostComposer(composerMarkup({ typed: ['One', 'Two https://example.com/a'] })).typed).toBe(
         'One\nTwo https://example.com/a'
      )
   })

   it('should say a Post button that was just pressed is busy and cannot be pressed again', () => {
      expect(
         parsePostComposer(
            composerMarkup({
               typed: ['Hello'],
               busy: true,
            })
         )
      ).toMatchObject({
         busy: true,
         canPost: false,
      })
   })

   it('should find a Post button that has no name of its own by its words, and say where it is among the dialog buttons', () => {
      const typed = parsePostComposer(
         composerMarkup({
            typed: ['Hello'],
            plain: true,
         })
      )
      const greyed = parsePostComposer(
         composerMarkup({
            plain: true,
            disabled: true,
         })
      )

      expect(typed).toMatchObject({
         present: true,
         canPost: true,
      })
      expect(typed.postIndex).toBeGreaterThanOrEqual(0)
      expect(greyed).toMatchObject({
         present: true,
         canPost: false,
      })
      expect(greyed.postIndex).toBe(typed.postIndex)
   })

   it('should leave the place of Post out when the button has its own name, which is found by it', () => {
      expect(parsePostComposer(composerMarkup({ typed: ['Hello'] })).postIndex).toBe(-1)
   })

   it('should read the audience LinkedIn names, whatever it is', () => {
      expect(parsePostComposer(composerMarkup({ audience: 'Anyone' })).audience).toBe('Anyone')
   })

   it('should read who may comment apart from who sees the post', () => {
      expect(parsePostComposer(composerMarkup({ comments: 'Off' }))).toMatchObject({
         audience: 'Connections only',
         comments: 'Off',
      })
   })

   it('should say there is no composer while the box is not drawn, and on a page that is not one', () => {
      expect(parsePostComposer(composerMarkup({ noEditor: true })).present).toBe(false)
      expect(parsePostComposer('<html><body></body></html>')).toMatchObject({
         present: false,
         typed: '',
         canPost: false,
      })
   })
})

describe('parsePostOptions', () => {
   it('should list the first words of each row of an open pop-up, in order, and nothing when none is open', () => {
      expect(parsePostOptions(composerMarkup({ popup: ['Anyone', 'Connections only', 'Group'] }))).toEqual([
         'Anyone',
         'Connections only',
         'Group',
      ])
      expect(parsePostOptions(composerMarkup())).toEqual([])
   })
})

describe('parsePostResult', () => {
   it('should read the link of the toast first, and the link of the window when there is no toast link', () => {
      expect(
         parsePostResult(
            postedMarkup({
               window: SHARE,
               toast: ACTIVITY,
            })
         )
      ).toEqual({
         posted: true,
         link: ACTIVITY,
      })
      expect(parsePostResult(postedMarkup({ window: SHARE }))).toEqual({
         posted: true,
         link: SHARE,
      })
   })

   it('should say the post went when the page says so but shows no link, and never take another post for ours', () => {
      expect(parsePostResult(postedMarkup())).toEqual({ posted: true })
   })

   it('should not take a link that is not a post address, even behind "View post"', () => {
      expect(
         parsePostResult(
            postedMarkup({ toast: 'https://evil.example/feed/update/urn:li:activity:7520195721216827392/' })
         )
      ).toEqual({ posted: true })
   })

   it('should say nothing was posted on the composer, and on a feed full of other posts', () => {
      expect(parsePostResult(composerMarkup({ typed: ['Hello'] }))).toEqual({ posted: false })
      expect(parsePostResult(feedMarkup())).toEqual({ posted: false })
      expect(parsePostResult('')).toEqual({ posted: false })
   })
})
