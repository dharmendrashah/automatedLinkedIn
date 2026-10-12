import { type PageReading, readDeviceAndBrowserInfo, readPixelscan } from './readers'

// What the page shows once, for the reader to look at. Both are taken when the page says its check is finished.
export type PageSnapshot = {
   text: string
   html: string
}

export type DetectionPage = {
   page: 'deviceandbrowserinfo' | 'pixelscan'
   url: string
   // Shows up when the page's own check is finished (a Playwright selector).
   readySelector: string
   read: (snapshot: PageSnapshot) => PageReading
}

// The public bot detection pages the browser test visits (.plan/spider-browser-test.md). Both start by themselves.
// Their hosts must be in SPIDER_ALLOWED_HOSTS, and their robots.txt is read like any other page's.
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
]
