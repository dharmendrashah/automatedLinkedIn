import { parse } from 'node-html-parser'
import { describe, expect, it } from 'vitest'

import { POST_BUTTON, POST_EDITOR, POST_START } from './markup'

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
})
