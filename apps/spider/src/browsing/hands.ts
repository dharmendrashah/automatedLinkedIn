import { type AnswerWatch, type DetectionSession, type InspectedElement, type PageInspection } from '../scraping/driver'

// What a task needs from a browser to move about a page like a person. The driver offers these one by one and a fake may leave
// some out; here they are checked once, so the rest of the code never asks whether a capability exists.
export type Hands = {
   // What the page holds now; with `block`, the parts of it that match (a post, a window).
   inspect: (block?: string) => Promise<PageInspection>
   scrollBy: (pixels: number) => Promise<boolean>
   // Clicks the link to `href` where nothing in `avoid` is under the pointer, and says where the page went.
   clickLink: (href: string, avoid: string) => Promise<string | undefined>
   // Clicks a link that was listed at this place, for one the page answers without changing its address.
   clickInside: (box: InspectedElement['box'], avoid: string) => Promise<boolean>
   clickSelector: (selector: string) => Promise<boolean>
   // Clicks the Nth element (from 0, in page order) of a selector, for a row that is not a link; false when it is not in view, unless
   // `bringIntoView` scrolls it there first.
   clickNth: (selector: string, index: number, avoid: string, bringIntoView?: boolean) => Promise<boolean>
   // Wheels over the first element of a selector that shows, so the pane that holds it scrolls; says whether the pane moved.
   scrollOver: (selector: string, pixels: number) => Promise<boolean>
   // Types into what has the focus (after a click on a box), at a person's pace; false when the browser cannot.
   typeKeys: (text: string) => Promise<boolean>
   // Gives files to the first file input of a selector (it may be hidden); false when the browser cannot or there is no such input.
   attachFiles: (selector: string, paths: string[]) => Promise<boolean>
   // Presses the Nth button of a selector and gives the files to the file chooser it opens; false when the browser cannot, there is
   // no such button, or no chooser opens.
   chooseFiles: (selector: string, index: number, paths: string[]) => Promise<boolean>
   // Downloads a file the page points to through the browser; undefined when it cannot, or the file is too large or not a success.
   fetchFile: (url: string, maxBytes: number) => Promise<{ body: Buffer; contentType: string } | undefined>
   // Listens for the statuses the page's requests are answered with, from now on; hears nothing in a browser that cannot.
   watchAnswers: (method: string, parts: string[]) => AnswerWatch
   // The markup of the page as it is now.
   html: () => Promise<string>
   back: () => Promise<string>
   hover: (x: number, y: number) => Promise<void>
   drift: () => Promise<void>
   press: (key: string) => Promise<void>
}

export const handsOf = (browser: DetectionSession): Hands => {
   const { inspect, clickLink, back } = browser

   if (!inspect || !clickLink || !back) {
      throw new Error('This browser cannot browse by clicking.')
   }

   const {
      clickInside,
      clickSelector,
      clickNth,
      scrollOver,
      typeKeys,
      attachFiles,
      chooseFiles,
      fetchFile,
      watchAnswers,
      hover,
      drift,
   } = browser

   return {
      inspect: block => inspect.call(browser, block ? { block } : undefined),
      scrollBy: pixels => browser.scrollBy(pixels),
      clickLink: (href, avoid) => clickLink.call(browser, href, avoid),
      clickInside: async (box, avoid) => (await clickInside?.call(browser, box, avoid)) === true,
      clickSelector: async selector => (await clickSelector?.call(browser, selector)) === true,
      clickNth: async (selector, index, avoid, bringIntoView) =>
         (await clickNth?.call(browser, selector, index, avoid, bringIntoView)) === true,
      scrollOver: async (selector, pixels) => (await scrollOver?.call(browser, selector, pixels)) === true,
      typeKeys: async text => {
         if (!typeKeys) {
            return false
         }

         await typeKeys.call(browser, text)

         return true
      },
      attachFiles: async (selector, paths) => (await attachFiles?.call(browser, selector, paths)) === true,
      chooseFiles: async (selector, index, paths) =>
         (await chooseFiles?.call(browser, selector, index, paths)) === true,
      fetchFile: async (url, maxBytes) => fetchFile?.call(browser, url, maxBytes),
      watchAnswers: (method, parts) =>
         watchAnswers?.call(browser, method, parts) ?? {
            statuses: () => [],
            stop: () => undefined,
         },
      html: () => browser.pageHtml(),
      back: () => back.call(browser),
      hover: async (x, y) => hover?.call(browser, x, y),
      drift: async () => drift?.call(browser),
      press: async key => {
         await browser.press(key)
      },
   }
}
