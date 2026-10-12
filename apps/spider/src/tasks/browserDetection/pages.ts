import { type PageReading, readDeviceAndBrowserInfo, readPixelscan, readPixelscanIp } from './readers'

// What the page shows once, for the reader to look at. Both are taken when the page says its check is finished.
export type PageSnapshot = {
   text: string
   html: string
}

export type DetectionPage = {
   page: 'deviceandbrowserinfo' | 'pixelscan' | 'pixelscan-ip' | 'pixelscan-blacklist'
   url: string
   // Its findings are shown as warnings and never decide the verdict (a page that judges the proxy's IP, not the browser).
   advisory?: boolean
   // Pressed once the page is open, for a page that does not run its check by itself (a Playwright selector).
   start?: string
   // Shows up when the page's own check is finished (a Playwright selector).
   readySelector: string
   read: (snapshot: PageSnapshot) => PageReading
}

// The public pages the browser test visits (.plan/spider-browser-test.md). Their hosts must be in SPIDER_ALLOWED_HOSTS,
// and their robots.txt is read like any other page's.
export const DETECTION_PAGES: DetectionPage[] = [
   {
      page: 'deviceandbrowserinfo',
      url: 'https://deviceandbrowserinfo.com/are_you_a_bot',
      readySelector: 'text=/You are (a bot|human|not a bot)/i',
      read: ({ text }) => readDeviceAndBrowserInfo(text),
   },
   {
      page: 'pixelscan',
      url: 'https://pixelscan.net/bot-check',
      readySelector: '.checker-header[state="success"], .checker-header[state="error"]',
      read: ({ html }) => readPixelscan(html),
   },
   {
      page: 'pixelscan-ip',
      url: 'https://pixelscan.net/ip',
      advisory: true,
      // Both cards first say "Collecting Data..." and the IP card is then called "IP Address listed as".
      readySelector:
         'body:has(.ip-card__label:text-is("IP Address")):has(.ip-blacklist-card__value:not(:has-text("Collecting")))',
      read: ({ html }) => readPixelscanIp(html),
   },
   {
      page: 'pixelscan-blacklist',
      url: 'https://pixelscan.net/ip-blacklist-check',
      advisory: true,
      start: '.state-default button',
      readySelector: '.checker-header[state="success"], .checker-header[state="error"]',
      read: ({ html }) => readPixelscan(html),
   },
]
