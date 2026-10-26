import { parse } from 'node-html-parser'
import { describe, expect, it } from 'vitest'

import { POST_BUTTON, POST_EDITOR, POST_MEDIA_BUTTON, POST_START } from './markup'

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
