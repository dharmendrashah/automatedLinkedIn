import { type ExtractedRecord, type ProxyConfig, type SessionCookie } from '../types'

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
}

export interface LoginDriver {
   open: (options?: OpenOptions) => Promise<LoginSession>
}
