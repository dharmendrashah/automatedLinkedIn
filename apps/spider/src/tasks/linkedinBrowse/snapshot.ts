import { type TaskContext } from '../defineTask'

// The run keeps at most 1 MB per file, and a feed is several MB of scripts, styles and icons the markup does not need.
const MAX_CHARS = 900_000

export const compactHtml = (html: string) =>
   html
      .replace(/<script\b[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[\s\S]*?<\/style>/gi, '')
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, '<svg/>')
      .replace(/>\s+</g, '><')
      .replace(/\s{2,}/g, ' ')
      .slice(0, MAX_CHARS)

// Keeps what the page is made of (its markup, every link and control with its place, a picture) with the run, to study how
// the real pages are built. It holds other members' public text, so it is only done when the owner asks for it.
export const snapshotPage = async (
   { browser, attach, screenshot, warn }: Pick<TaskContext, 'browser' | 'attach' | 'screenshot' | 'warn'>,
   name: string,
   block?: string
) => {
   try {
      attach(`${name}.html`, compactHtml(await browser.pageHtml()), 'text/html')

      const inspection = await browser.inspect?.(block ? { block } : undefined)

      if (inspection) {
         attach(`${name}.inspect.json`, JSON.stringify(inspection, null, 1), 'application/json')
      }

      const picture = await browser.screenshot?.()

      if (picture) {
         await screenshot(name, picture)
      }
   } catch {
      warn('The page could not be kept for study')
   }
}
