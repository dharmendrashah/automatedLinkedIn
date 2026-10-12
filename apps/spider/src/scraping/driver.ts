import { type ExtractedRecord, type ProxyConfig, type SessionCookie } from '../types'

import { type RunRecorder } from '../recording/recorder'

// What the engine needs from a browser. Camoufox implements it; tests use a fake.
export interface BrowserSession {
   addCookies: (cookies: SessionCookie[]) => Promise<void>
   // Every cookie the browser holds right now.
   cookies: () => Promise<SessionCookie[]>
   // Opens a url and returns the url the browser ended up on (after redirects).
   goto: (url: string, waitForSelector?: string) => Promise<string>
   // Clicks an element and returns the url afterwards, because a click can navigate.
   click: (selector: string, waitForSelector?: string) => Promise<string>
   extract: (selectors: Record<string, string>, limit: number) => Promise<ExtractedRecord[]>
   close: () => Promise<void>
}

export type OpenOptions = {
   // When set, all traffic goes through it. A proxy that fails fails the task; there is no direct fallback.
   proxy?: ProxyConfig
   // When set, the browser records a video and reports what the page does to it (.plan/spider-session-recording.md).
   recorder?: RunRecorder
}

export interface BrowserDriver {
   open: (options?: OpenOptions) => Promise<BrowserSession>
}

// What account validation needs on top of a browser: typing into a form and looking at the page. Scrape tasks never
// get it, so they cannot type credentials.
export interface LoginSession extends BrowserSession {
   fill: (selector: string, value: string) => Promise<void>
   // Whether the element shows up within `timeoutMs`.
   exists: (selector: string, timeoutMs: number) => Promise<boolean>
   // Only what a recording needs; a fake browser may leave them out.
   screenshot?: () => Promise<Buffer>
   pageHtml?: () => Promise<string>
}

export interface LoginDriver {
   open: (options?: OpenOptions) => Promise<LoginSession>
}

// What the browser reports about itself, kept in a browser test's report so results of different runs can be compared.
export type BrowserIdentity = {
   userAgent: string
   platform: string
   screen: string
}

// What a browser test needs on top of a login session: scrolling, reading the page, and a picture of all of it.
export interface DetectionSession extends LoginSession {
   // Scrolls down by `pixels` and says whether there is more page below.
   scrollBy: (pixels: number) => Promise<boolean>
   pageText: () => Promise<string>
   pageHtml: () => Promise<string>
   fullPageScreenshot: () => Promise<Buffer>
   identity: () => Promise<BrowserIdentity>
}

export interface DetectionDriver {
   open: (options?: OpenOptions) => Promise<DetectionSession>
}
