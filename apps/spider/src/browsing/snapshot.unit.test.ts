import { describe, expect, it, vi } from 'vitest'

import { compactHtml, createKeep, snapshotPage } from './snapshot'

describe('compactHtml', () => {
   it('should drop scripts, styles and icons, which hide the markup and fill the file', () => {
      const html = compactHtml(
         '<div><script nonce="x">var a = 1</script><style>.a{color:red}</style><svg viewBox="0 0 1 1"><path d="M0"/></svg><a href="/in/ada/">Ada</a></div>'
      )

      expect(html).toBe('<div><svg/><a href="/in/ada/">Ada</a></div>')
   })

   it('should collapse the white space between tags', () => {
      expect(compactHtml('<div>\n\n   <p>  one  </p>\n   <p>two</p>\n</div>')).toBe('<div><p> one </p><p>two</p></div>')
   })

   it('should drop the head, bootstrap data blocks and giant attribute values, so the body is not cut off', () => {
      const html = `<html><head><meta content="${'x'.repeat(2_000_000)}"></head><body><code id="data">{"a":1}</code><div data-state="${'y'.repeat(2000)}"><p>Hi</p></div></body></html>`

      expect(compactHtml(html)).toBe('<html><body><code/><div data-state="…"><p>Hi</p></div></body></html>')
   })

   it('should cut a page that is still too large, so the run keeps the file', () => {
      expect(compactHtml(`<p>${'x'.repeat(2_000_000)}</p>`).length).toBeLessThanOrEqual(900_000)
   })
})

const setup = (browser: Record<string, unknown>) => {
   const context = {
      browser: {
         pageHtml: vi.fn(async () => '<html><script>x</script><a href="/in/ada/">Ada</a></html>'),
         ...browser,
      },
      attach: vi.fn(),
      screenshot: vi.fn(async () => undefined),
      warn: vi.fn(),
   }

   return {
      context,
      snap: (name: string, block?: string) => snapshotPage(context as never, name, block),
   }
}

describe('snapshotPage', () => {
   it('should keep the page, what is on it and a picture, under the name', async () => {
      const inspection = {
         url: 'https://www.linkedin.com/feed/',
         links: [],
         controls: [],
      }
      const inspect = vi.fn(async (_options?: { block?: string }) => inspection)
      const { snap, context } = setup({
         inspect,
         screenshot: vi.fn(async () => Buffer.from('png')),
      })

      await snap('feed', '[data-post]')

      expect(inspect).toHaveBeenCalledWith({ block: '[data-post]' })
      expect(context.attach).toHaveBeenCalledWith('feed.html', '<html><a href="/in/ada/">Ada</a></html>', 'text/html')
      expect(context.attach).toHaveBeenCalledWith(
         'feed.inspect.json',
         JSON.stringify(inspection, null, 1),
         'application/json'
      )
      expect(context.screenshot).toHaveBeenCalledWith('feed', Buffer.from('png'))
   })

   it('should keep what it can when the browser cannot inspect or take a picture', async () => {
      const { snap, context } = setup({})

      await snap('post')

      expect(context.attach).toHaveBeenCalledTimes(1)
      expect(context.screenshot).not.toHaveBeenCalled()
   })

   it('should never fail the visit when keeping a page goes wrong', async () => {
      const { snap, context } = setup({
         pageHtml: vi.fn(async () => {
            throw new Error('page closed')
         }),
      })

      await expect(snap('feed')).resolves.toBeUndefined()
      expect(context.warn).toHaveBeenCalledWith('The page could not be kept for study')
   })
})

describe('createKeep', () => {
   const keeper = () => ({
      browser: { pageHtml: vi.fn(async () => '<html></html>') },
      attach: vi.fn(),
      screenshot: vi.fn(async () => undefined),
      warn: vi.fn(),
   })

   it('should keep each name once, and nothing when it was not asked to', async () => {
      const asked = keeper()
      const keep = createKeep(asked as never, true)
      const notAsked = keeper()
      const keepNothing = createKeep(notAsked as never, false)

      await keep('feed')
      await keep('feed')
      await keepNothing('feed')

      expect(asked.attach).toHaveBeenCalledTimes(1)
      expect(notAsked.attach).not.toHaveBeenCalled()
   })
})
