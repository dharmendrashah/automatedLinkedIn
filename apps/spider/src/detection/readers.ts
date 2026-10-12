import { type BrowserTestOutcome } from '@automatedLinkedIn/contracts'

export type PageVerdict = 'HUMAN' | 'BOT' | 'UNKNOWN'

// One thing a page checked. `flagged` is true when the page counted it against the browser.
export type DetectionSignal = {
   name: string
   flagged: boolean
}

export type PageReading = {
   verdict: PageVerdict
   // The page's own headline, for the report.
   headline: string
   signals: DetectionSignal[]
}

const NOT_UNDERSTOOD: PageReading = {
   verdict: 'UNKNOWN',
   headline: '',
   signals: [],
}

// The page's own answer is the only thing read: a page that cannot be understood is UNKNOWN, never "human".
// https://deviceandbrowserinfo.com/are_you_a_bot prints "You are human!" or "You are a bot!" and a JSON block
// { "isBot": boolean, "details": { signal: boolean } }. `text` is the visible text of the page.
export const readDeviceAndBrowserInfo = (text: string): PageReading => {
   const marker = text.indexOf('"isBot"')
   const start = marker === -1 ? -1 : text.lastIndexOf('{', marker)

   if (start === -1) {
      return NOT_UNDERSTOOD
   }

   let depth = 0
   let end = -1

   for (let index = start; index < text.length; index += 1) {
      if (text[index] === '{') {
         depth += 1
      } else if (text[index] === '}') {
         depth -= 1

         if (depth === 0) {
            end = index

            break
         }
      }
   }

   if (end === -1) {
      return NOT_UNDERSTOOD
   }

   let report: { isBot?: unknown; details?: unknown }

   try {
      report = JSON.parse(text.slice(start, end + 1))
   } catch {
      return NOT_UNDERSTOOD
   }

   if (typeof report.isBot !== 'boolean') {
      return NOT_UNDERSTOOD
   }

   const details = report.details && typeof report.details === 'object' ? Object.entries(report.details) : []

   return {
      verdict: report.isBot ? 'BOT' : 'HUMAN',
      headline: text.match(/You are (?:a bot|human|not a bot)!?/i)?.[0] ?? '',
      signals: details.map(([name, value]) => ({
         name,
         flagged: value === true,
      })),
   }
}

// https://pixelscan.net/bot-check runs by itself. Its header element carries state="success" (human) or state="error"
// (bot), and the titles of both states; each category tab says Clear or Detected. `html` is the page's HTML.
export const readPixelscan = (html: string): PageReading => {
   const state = html.match(/class="checker-header"[^>]*\sstate="([a-z]+)"/)?.[1]

   if (state !== 'success' && state !== 'error') {
      return NOT_UNDERSTOOD
   }

   const title = html.match(new RegExp(`${state === 'success' ? 'successtitle' : 'errortitle'}="([^"]*)"`))?.[1] ?? ''
   const categories = [
      ...html.matchAll(
         /<span[^>]*class="summary-section__title"[^>]*>([^<]*)<\/span>\s*<span[^>]*class="summary-section__status"[^>]*>([^<]*)<\/span>/g
      ),
   ]

   return {
      verdict: state === 'success' ? 'HUMAN' : 'BOT',
      headline: title.replace(/&#39;/g, "'"),
      signals: categories.map(([, name, status]) => ({
         name: name.trim(),
         flagged: status.trim().toLowerCase() !== 'clear',
      })),
   }
}

// Detected as soon as one page says bot. Not detected only when every page said human.
export const combine = (verdicts: PageVerdict[]): BrowserTestOutcome => {
   if (verdicts.includes('BOT')) {
      return 'DETECTED'
   }

   return verdicts.length > 0 && verdicts.every(verdict => verdict === 'HUMAN') ? 'NOT_DETECTED' : 'COULD_NOT_TELL'
}
