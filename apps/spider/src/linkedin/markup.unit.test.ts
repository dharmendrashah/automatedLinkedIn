import { parse } from 'node-html-parser'
import { describe, expect, it } from 'vitest'

import { NEVER_CLICK, POST_BUTTON, POST_EDITOR, POST_MEDIA_BUTTON, POST_START } from './markup'

// The hands find these with plain CSS (`document.querySelectorAll`), so a Playwright-only selector (`:visible`, `>>`) throws on
// the page and the task ends in ERROR (seen 2026-10-26 with the "Start a post" box).
describe('the selectors the post task clicks', () => {
   const html = parse(
      '<div aria-label="Start a post"></div><div contenteditable="true" componentkey="ShareBox_textEditor"></div><button data-view-name="share-post"></button>'
   )

   it.each([
      ['POST_START', POST_START],
      ['POST_EDITOR', POST_EDITOR],
      ['POST_BUTTON', POST_BUTTON],
   ])('%s is plain CSS that finds its element', (_name, selector) => {
      expect(selector).not.toMatch(/>>|:visible/)
      expect(html.querySelector(selector)).not.toBeNull()
   })

   // The Media button as the composer without data-view-names draws it (a staging post of 2026-10-27 found none) and as the other one does.
   it.each([
      '<button type="button" componentkey="d2cc821b-bf3a-42cb-8dda-fbdf21aef64b" aria-label="Media" aria-haspopup="dialog" aria-expanded="false"></button>',
      '<button type="button" aria-label="Media" data-view-name="share-sharebox-bottom-bar-media"></button>',
   ])('POST_MEDIA_BUTTON finds the button of %s', markup => {
      expect(parse(markup).querySelector(POST_MEDIA_BUTTON)).not.toBeNull()
   })

   it('POST_MEDIA_BUTTON does not take another button for the Media button', () => {
      expect(parse('<button aria-label="Show Emoji Picker"></button>').querySelector(POST_MEDIA_BUTTON)).toBeNull()
   })
})

// A conversation row of the messages list (structure of 2026-10-28): its selection checkbox is a label inside the row's link, and a
// click on the label ticks the row. A click on the row's own text must still be allowed.
describe('the clicks a message row must never take', () => {
   const row = parse(
      '<a class="msg-conversation-listitem__link"><div class="msg-selectable-entity__checkbox-container"><input type="checkbox"><label class="msg-selectable-entity__checkbox-label" aria-label="Select conversation"></label></div><h3>title</h3></a>'
   )

   it('takes the selection checkbox, its container and its label, and never the row or its text', () => {
      const taken = row.querySelectorAll(NEVER_CLICK).map(element => element.tagName)

      expect(taken).toEqual(expect.arrayContaining(['DIV', 'INPUT', 'LABEL']))
      expect(taken).not.toContain('A')
      expect(taken).not.toContain('H3')
   })
})
