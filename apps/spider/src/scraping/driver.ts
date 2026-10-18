import { type ExtractedRecord, type ProxyConfig, type SessionCookie } from '../types'

import { type DeviceIdentity } from '../identity/deviceIdentity'
import { type RunRecorder } from '../recording/recorder'
import { type SavedState } from '../sessions/sessionVault'

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
   // The device of an account: the browser looks the same on every run. Without it each run is a new device.
   identity?: DeviceIdentity
   // The proxy's exit address, when the caller already looked it up, so the browser does not ask again.
   exitIp?: string
   // The cookies and local storage the account had at the end of its last good sign-in.
   storageState?: SavedState
   // The account's browser profile folder. With it the browser is the same Firefox profile every run (cookies, site storage,
   // history, cache), and `storageState` only fills a profile that starts empty.
   profileDir?: string
}

export interface BrowserDriver {
   open: (options?: OpenOptions) => Promise<BrowserSession>
}

// What account validation needs on top of a browser: typing into a form and looking at the page. Scrape tasks never
// get it, so they cannot type credentials.
export interface LoginSession extends BrowserSession {
   // Removes the browser's cookies of that name, such as a token LinkedIn refused but cannot make the browser forget.
   clearCookies: (name: string) => Promise<void>
   fill: (selector: string, value: string) => Promise<void>
   // Types key by key once, without reading the field back: for a code box that sends itself after the last digit.
   type: (selector: string, value: string) => Promise<void>
   // Presses a key in the element that has the focus (Enter sends a form) and returns the url afterwards.
   press: (key: string) => Promise<string>
   // Whether the element shows up within `timeoutMs`.
   exists: (selector: string, timeoutMs: number) => Promise<boolean>
   // Only what a recording needs; a fake browser may leave them out.
   screenshot?: () => Promise<Buffer>
   pageHtml?: () => Promise<string>
   // Waits for the redirects after a submit to end, and says where the browser is. A fake browser may leave it out.
   settled?: () => Promise<string>
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

// The values a script can read about the browser, as one place (the page, an iframe, a worker) sees them. A worker has
// no `webdriver` flag in some browsers.
export type ProbeFacts = {
   userAgent: string
   platform: string
   language: string
   languages: string
   timezone: string
   hardwareConcurrency: number
   webdriver?: boolean
}

// A world that could not be read is left out.
export type ProbeReading = {
   window: ProbeFacts
   iframe?: ProbeFacts
   worker?: ProbeFacts
}

// What a person at the keyboard can do to a page, for human takeover. Positions are fractions of the page, so the owner's
// screen size does not matter. There is no way to run code in the page.
export interface SessionControl {
   frame: () => Promise<{ jpeg: Buffer; width: number; height: number }>
   click: (x: number, y: number) => Promise<void>
   type: (text: string) => Promise<void>
   press: (key: string) => Promise<void>
   scroll: (dy: number) => Promise<void>
}

// What a browser holds between runs: the cookies and the local storage of each site. It carries login tokens.
// One site's IndexedDB as Playwright takes and restores it. Its typings leave it out; nothing here reads inside it.
export type IndexedDbState = unknown[]

export type StorageState = {
   cookies: SessionCookie[]
   origins: Array<{
      origin: string
      localStorage: Array<{ name: string; value: string }>
      indexedDB?: IndexedDbState
   }>
}

// What a browser test needs on top of a login session: scrolling, reading the page, and a picture of all of it.
export interface DetectionSession extends LoginSession {
   // Scrolls down by `pixels` and says whether there is more page below.
   scrollBy: (pixels: number) => Promise<boolean>
   pageText: () => Promise<string>
   pageHtml: () => Promise<string>
   fullPageScreenshot: () => Promise<Buffer>
   identity: () => Promise<BrowserIdentity>
   // What the page, an iframe and a worker each report about the browser. A fake browser may leave it out.
   probe?: () => Promise<ProbeReading>
   // Present when a person can take over the page.
   control?: SessionControl
   storageState: () => Promise<StorageState>
}

export interface DetectionDriver {
   open: (options?: OpenOptions) => Promise<DetectionSession>
}
