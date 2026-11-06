import { describe, expect, it } from 'vitest'

import { ACTIVITY, AUTHOR, COMPOSE_REPOST_INDEX, KEY, commentIdOf, postDefaults, postPage } from './engageFixture'
import {
   REPOST_MENU,
   activityKeyOf,
   commentBoxOf,
   commentsSaying,
   composerOn,
   pickerShows,
   postIsOn,
   reactionStateOf,
   replyPlaceOf,
   repostMenuIndexOf,
   repostSubmitIndexOf,
   repostedOn,
   submitEnabled,
} from './engageReader'

describe('activityKeyOf', () => {
   it('should read the post own activity key from its reaction bar, and nothing from a page without one', () => {
      expect(activityKeyOf(postPage(postDefaults))).toBe(KEY)
      expect(activityKeyOf('<main><div>urn:li:activity:7000000000000000009</div></main>')).toBeUndefined()
   })
})

describe('reactionStateOf', () => {
   it('should read the state the reaction control shows, and nothing when it is not on the page', () => {
      expect(reactionStateOf(postPage(postDefaults))).toBe('no reaction')
      expect(
         reactionStateOf(
            postPage({
               ...postDefaults,
               reaction: 'Love',
            })
         )
      ).toBe('Love')
      expect(reactionStateOf('<main></main>')).toBeUndefined()
   })
})

describe('postIsOn', () => {
   it('should find the post by its activity id and by its author, and not another post', () => {
      const html = postPage(postDefaults)

      expect(postIsOn(html, KEY, AUTHOR)).toBe(true)
      expect(postIsOn(html, 'activity:7000000000000000002', AUTHOR)).toBe(false)
      expect(postIsOn(html, KEY, 'Someone Else')).toBe(false)
      expect(postIsOn(`<main>${ACTIVITY}</main>`, KEY)).toBe(false)
   })
})

describe('commentBoxOf and submitEnabled', () => {
   it('should say the post has no box, or what the box holds', () => {
      expect(
         commentBoxOf(
            postPage({
               ...postDefaults,
               box: false,
            })
         )
      ).toBeUndefined()
      expect(commentBoxOf(postPage(postDefaults))).toEqual({ words: '' })
      expect(
         commentBoxOf(
            postPage({
               ...postDefaults,
               words: 'Good read',
            })
         )
      ).toEqual({ words: 'Good read' })
   })

   it('should enable Comment only once the box has words and LinkedIn is not taking them', () => {
      expect(submitEnabled(postPage(postDefaults))).toBe(false)
      expect(
         submitEnabled(
            postPage({
               ...postDefaults,
               words: 'Good read',
            })
         )
      ).toBe(true)
      expect(
         submitEnabled(
            postPage({
               ...postDefaults,
               words: 'Good read',
               busy: true,
            })
         )
      ).toBe(false)
   })
})

describe('pickerShows', () => {
   it('should say the popover offers the reaction only while it is open', () => {
      expect(pickerShows(postPage(postDefaults), 'Insightful')).toBe(false)
      expect(
         pickerShows(
            postPage({
               ...postDefaults,
               picker: true,
            }),
            'Insightful'
         )
      ).toBe(true)
   })
})

describe('repostMenuIndexOf', () => {
   it('should give the place of Repost with thoughts among the menu items, and -1 when the menu is closed or lacks it', () => {
      expect(repostMenuIndexOf(postPage(postDefaults))).toBe(-1)
      expect(
         repostMenuIndexOf(
            postPage({
               ...postDefaults,
               menu: true,
            })
         )
      ).toBe(0)
      expect(
         repostMenuIndexOf(
            postPage({
               ...postDefaults,
               menu: true,
               menuItems: ['Repost instantly'],
            })
         )
      ).toBe(-1)
   })
})

describe('repostMenuIndexOf for Repost instantly', () => {
   it('should give the place of Repost instantly among the menu items', () => {
      expect(
         repostMenuIndexOf(
            postPage({
               ...postDefaults,
               menu: true,
            }),
            REPOST_MENU.instantly
         )
      ).toBe(1)
   })
})

describe('replyPlaceOf', () => {
   const TARGET = commentIdOf(0)
   const commented = {
      ...postDefaults,
      comments: ['Good read'],
   }

   it('should find the Reply button of a comment, and nothing for a comment the page does not have', () => {
      expect(replyPlaceOf(postPage(commented), TARGET)).toEqual({
         reply: 0,
         editor: undefined,
         submit: undefined,
      })
      expect(replyPlaceOf(postPage(commented), commentIdOf(9))).toBeUndefined()
   })

   it('should find the reply box once it is open, and its Reply button once there are words', () => {
      const open = {
         ...commented,
         replyOpen: TARGET,
      }

      expect(replyPlaceOf(postPage(open), TARGET)?.editor).toBe(1)
      expect(replyPlaceOf(postPage(open), TARGET)?.submit).toBeUndefined()
      expect(
         replyPlaceOf(
            postPage({
               ...open,
               words: 'Thanks',
            }),
            TARGET
         )?.submit
      ).toBeGreaterThan(0)
   })
})

describe('replyPlaceOf below a nested reply', () => {
   it('should find the reply box that opens after the thread of a comment, past its nested replies', () => {
      const target = commentIdOf(0)
      const html = [
         `<main><div id="replaceableComment_urn:li:comment:(activity:${ACTIVITY},${target})"><span>Good read</span><button type="button" aria-label="Reply"></button></div>`,
         `<div id="replaceableComment_urn:li:comment:(urn:li:comment:(activity:${ACTIVITY},${target}),${commentIdOf(1)})"><span>Agreed</span><button type="button" aria-label="Reply"></button></div>`,
         '<div contenteditable="true" role="textbox" dir="auto" tabindex="0" aria-label="Text editor for creating comment"><p><strong>Ada</strong>&nbsp;words</p></div>',
         '<div><button type="button"><span>Reply</span></button></div></main>',
      ].join('')

      expect(replyPlaceOf(html, target)).toEqual({
         reply: 0,
         editor: 0,
         submit: 2,
      })
   })
})

describe('commentsSaying for a reply', () => {
   it('should count a reply whose id is nested under its comment', () => {
      const html = '<div id="replaceableComment_urn:li:comment:(urn:li:comment:(activity:1,2),3)">Good read</div>'

      expect(commentsSaying(html, 'Good read')).toBe(1)
   })
})

describe('repostSubmitIndexOf and composerOn', () => {
   it('should find the Repost button of the compose page once it is enabled, and the composer on that page', () => {
      const compose = {
         ...postDefaults,
         compose: true,
      }

      expect(repostSubmitIndexOf(postPage(compose))).toBe(-1)
      expect(
         repostSubmitIndexOf(
            postPage({
               ...compose,
               words: 'Worth a read',
            })
         )
      ).toBe(COMPOSE_REPOST_INDEX)
      expect(composerOn(postPage(compose))).toBe(true)
      expect(composerOn(postPage(postDefaults))).toBe(false)
   })
})

describe('repostedOn', () => {
   it('should say a repost went only when LinkedIn shows its alert', () => {
      expect(repostedOn(postPage(postDefaults))).toBe(false)
      expect(
         repostedOn(
            postPage({
               ...postDefaults,
               reposted: true,
            })
         )
      ).toBe(true)
   })
})

describe('commentsSaying', () => {
   it('should count a comment that LinkedIn cut short by its start, so a long comment is still found', () => {
      const long = 'This is a long comment that goes on well past the point where LinkedIn cuts it short'
      const html = postPage({
         ...postDefaults,
         comments: [`${long.slice(0, 60)}…more`],
      })

      expect(commentsSaying(html, long)).toBe(1)
   })

   it('should count the comments with these words, ignoring spaces and other comments', () => {
      const html = postPage({
         ...postDefaults,
         comments: ['Good read', 'Another point'],
      })

      expect(commentsSaying(html, 'Good read')).toBe(1)
      expect(commentsSaying(html, 'Good  read')).toBe(1)
      expect(commentsSaying(html, 'Nothing like this')).toBe(0)
   })
})
