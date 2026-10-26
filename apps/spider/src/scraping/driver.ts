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
   // Where the browser is now, for the end of a run. A fake browser may leave it out.
   pageUrl?: () => string
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

// A link or a control of the page as it shows on screen: where it is and what surrounds it, which is what tells a safe thing
// to click from a button that does something. Text and labels are cut short.
export type InspectedElement = {
   tag: string
   // The full address of a link.
   href?: string
   text: string
   label: string
   role: string
   // The element's own data-view-name, when it has one.
   view: string
   box: { x: number; y: number; width: number; height: number }
   // The whole box is inside the window.
   inView: boolean
   // Something else is on top of the middle of its box (a docked tray, a pop-up).
   covered: boolean
   // The elements around it, nearest first, as `tag[role=..][data-name=value]`.
   path: string[]
}

// A repeated part of a page (a post of a feed) with what it carries and holds. It has no box of its own: such wrappers are
// often `display: contents`, so where it is comes from the links inside.
export type InspectedBlock = {
   // Identifiers in its markup (component keys, anchor ids) that hold a urn or a long number.
   keys: string[]
   // The data-view-name values found inside it.
   marks: string[]
   links: InspectedElement[]
}

export type PageInspection = {
   url: string
   title: string
   viewport: { width: number; height: number }
   scrollY: number
   links: InspectedElement[]
   controls: InspectedElement[]
   // Only when asked for with a `block` selector.
   blocks: InspectedBlock[]
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

// What a task hears of how the page's requests are answered (statuses only).
export type AnswerWatch = {
   statuses: () => number[]
   stop: () => void
}

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
   // Scrolls down by `pixels` (up when negative) and says whether there is more page below.
   scrollBy: (pixels: number) => Promise<boolean>
   pageText: () => Promise<string>
   pageHtml: () => Promise<string>
   fullPageScreenshot: () => Promise<Buffer>
   identity: () => Promise<BrowserIdentity>
   // What the page, an iframe and a worker each report about the browser. A fake browser may leave it out.
   probe?: () => Promise<ProbeReading>
   // The links and controls of the page as they show on screen, and, with `block`, what each element of that selector holds.
   // A fake browser may leave it out, as it may the ones that follow.
   inspect?: (options?: { block?: string }) => Promise<PageInspection>
   // Clicks a link to `href` as a person does: the pointer glides to a spot of it where nothing covers it and nothing that
   // matches `avoid` is under the pointer, rests a moment, then clicks. Resolves to where the browser is afterwards, or
   // undefined when there was no such spot or the page did not change.
   clickLink?: (href: string, avoid: string) => Promise<string | undefined>
   // Clicks the link that was listed at this place, where nothing covers it and nothing that matches `avoid` is under the pointer,
   // for a link the page answers without changing the address (an image that opens a window). Says whether it did.
   clickInside?: (box: InspectedElement['box'], avoid: string) => Promise<boolean>
   // Clicks the first element of `selector` that is in view and not covered, and says whether it did.
   clickSelector?: (selector: string) => Promise<boolean>
   // Clicks the Nth element (from 0, in page order) of `selector`, where it is on top and nothing that matches `avoid` is under the
   // pointer, for a row of a list that is not a link. False when it is not in view or there is no such element.
   clickNth?: (selector: string, index: number, avoid: string, bringIntoView?: boolean) => Promise<boolean>
   // Wheels over the first element of `selector` that shows, so the pane that holds it scrolls (a list and the conversation beside it
   // scroll on their own). Says whether the pane moved.
   scrollOver?: (selector: string, pixels: number) => Promise<boolean>
   // Types into whatever has the focus, key by key at a person's pace; a line break is Shift+Enter, which makes a new line where a bare
   // Enter would send.
   typeKeys?: (text: string) => Promise<void>
   // Gives files (by path on this machine) to the first file input of `selector`, which may be hidden, as a person's choice in the
   // file dialog does. False when there is no such input.
   attachFiles?: (selector: string, paths: string[]) => Promise<boolean>
   // Clicks the Nth element (from 0, in page order) of `selector` as a person does and gives `paths` to the file chooser that click
   // opens, for a button that makes its file input only when it is pressed. False when there is no such element or no chooser opens.
   chooseFiles?: (selector: string, index: number, paths: string[]) => Promise<boolean>
   // Downloads a file the page points to through the browser's own network (its proxy, cookies and language), as the page loads a
   // picture. Undefined when the answer is not a success, is a redirect, or is larger than `maxBytes`.
   fetchFile?: (url: string, maxBytes: number) => Promise<{ body: Buffer; contentType: string } | undefined>
   // Starts to listen for how the page's requests are answered: from now on, `statuses()` holds the status of every answer to a
   // `method` request whose address holds all of `parts`. Only the status, never what was sent or answered. `stop()` ends it.
   watchAnswers?: (method: string, parts: string[]) => AnswerWatch
   // One step back in the browser's history, and where it ended.
   back?: () => Promise<string>
   // Rests the pointer at a point of the window, or moves it a little, as a hand does while reading.
   hover?: (x: number, y: number) => Promise<void>
   drift?: () => Promise<void>
   // Present when a person can take over the page.
   control?: SessionControl
   storageState: () => Promise<StorageState>
}

export interface DetectionDriver {
   open: (options?: OpenOptions) => Promise<DetectionSession>
}
