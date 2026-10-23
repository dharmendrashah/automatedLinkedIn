import { type DetectionSession } from '../scraping/driver'

// The run keeps at most 1 MB per file, and a page is several MB of scripts, styles, icons, bootstrap data in the head and in `<code>`
// blocks, and huge attribute values, none of which the markup needs (a page's head alone filled the file once, and the body was lost).
const MAX_CHARS = 900_000

export const compactHtml = (html: string) =>
   html
      .replace(/<head\b[\s\S]*?<\/head>/gi, '')
      .replace(/<code\b[\s\S]*?<\/code>/gi, '<code/>')
      .replace(/(\s[\w:-]+)="[^"]{1500,}"/g, '$1="…"')
      .replace(/<script\b[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[\s\S]*?<\/style>/gi, '')
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, '<svg/>')
      .replace(/>\s+</g, '><')
      .replace(/\s{2,}/g, ' ')
      .slice(0, MAX_CHARS)

// What it keeps a page with: the browser, and where a run puts files and pictures.
export type Keeper = {
   browser: Pick<DetectionSession, 'pageHtml' | 'inspect' | 'screenshot'>
   attach: (name: string, content: string, contentType: string) => void
   screenshot: (name: string, png: Buffer) => Promise<void>
   warn: (message: string) => void
}

// Keeps what the page is made of (its markup, every link and control with its place, a picture) with the run, to study how
// the real pages are built. It holds other members' public text, so it is only done when the owner asks for it.
export const snapshotPage = async ({ browser, attach, screenshot, warn }: Keeper, name: string, block?: string) => {
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

// Keeps each name once, and only when the owner asked for it.
export const createKeep = (keeper: Keeper, enabled: boolean, block?: string) => {
   const kept = new Set<string>()

   return async (name: string) => {
      if (enabled && !kept.has(name)) {
         kept.add(name)
         await snapshotPage(keeper, name, block)
      }
   }
}
