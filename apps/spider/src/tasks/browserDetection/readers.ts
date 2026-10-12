export type PageVerdict = 'HUMAN' | 'BOT' | 'UNKNOWN'

export type DetectionOutcome = 'NOT_DETECTED' | 'DETECTED' | 'COULD_NOT_TELL'

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
// https://pixelscan.net/ip-blacklist-check has the same header (success is clear, error is listed) and, after its check,
// one result item per blacklist, the ones the IP is on marked is-listed.
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
   const listings = [
      ...html.matchAll(/class="result-item( is-listed)?"[^>]*>\s*<span[^>]*class="server-name"[^>]*>([^<]*)<\/span>/g),
   ]

   return {
      verdict: state === 'success' ? 'HUMAN' : 'BOT',
      headline: title.replace(/&#39;/g, "'"),
      signals: [
         ...categories.map(([, name, status]) => ({
            name: name.trim(),
            flagged: status.trim().toLowerCase() !== 'clear',
         })),
         ...listings.map(([, listed, name]) => ({
            name: name.trim(),
            flagged: Boolean(listed),
         })),
      ],
   }
}

// https://pixelscan.net/ip says "Collecting Data..." until its checks are in. Then the IP Address card says Clean, the IP
// Blacklist card says Not blacklisted and the Proxy card says No twice. Anything else counts against the IP. The two cards
// are required; a proxy row the page does not show is left out.
export const readPixelscanIp = (html: string): PageReading => {
   const cardPattern =
      /class="(?:ip-card|ip-blacklist-card)__label"[^>]*>([^<]*)<\/span>\s*<p[^>]*class="(?:ip-card|ip-blacklist-card)__value[^"]*"[^>]*>\s*([^<]*?)\s*<\/p>/g
   const cards = new Map([...html.matchAll(cardPattern)].map(([, label, value]) => [label.trim(), value]))
   const address = cards.get('IP Address')
   const blacklist = cards.get('IP Blacklist')
   const missing = (value?: string) => !value || /collecting/i.test(value)

   if (address === undefined || blacklist === undefined || missing(address) || missing(blacklist)) {
      return NOT_UNDERSTOOD
   }

   const row = (label: string) =>
      html.match(
         new RegExp(
            `checker-details-label">${label}</p>[\\s\\S]{0,3000}?checker-details-value"[^>]*>\\s*([^<]*?)\\s*</p>`
         )
      )?.[1]
   const proxyRows = [
      {
         name: 'Proxy detection',
         value: row('Proxy Detection'),
      },
      {
         name: 'Rotating proxy',
         value: row('Rotating Proxy'),
      },
   ].flatMap(({ name, value }) =>
      value
         ? [
              {
                 name,
                 flagged: value.toLowerCase() !== 'no',
              },
           ]
         : []
   )
   const signals: DetectionSignal[] = [
      {
         name: 'IP address',
         flagged: address.toLowerCase() !== 'clean',
      },
      {
         name: 'IP blacklist',
         flagged: blacklist.toLowerCase() !== 'not blacklisted',
      },
      ...proxyRows,
   ]

   return {
      verdict: signals.some(({ flagged }) => flagged) ? 'BOT' : 'HUMAN',
      headline: `IP address: ${address}. IP blacklist: ${blacklist}.`,
      signals,
   }
}

// Detected as soon as one page says bot. Not detected only when every page said human.
export const combine = (verdicts: PageVerdict[]): DetectionOutcome => {
   if (verdicts.includes('BOT')) {
      return 'DETECTED'
   }

   return verdicts.length > 0 && verdicts.every(verdict => verdict === 'HUMAN') ? 'NOT_DETECTED' : 'COULD_NOT_TELL'
}
