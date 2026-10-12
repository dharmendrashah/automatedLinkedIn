import { type TimelineStep } from './recording'

type Kind = 'VALIDATE_ACCOUNT' | 'BROWSER_TEST' | 'SCRAPE'

const ACTIONS: Record<Kind, string> = {
   VALIDATE_ACCOUNT: 'Check account sign-in',
   BROWSER_TEST: 'Browser test',
   SCRAPE: 'Collect data',
}

export const actionLabel = (kind: Kind) => ACTIONS[kind]

type ResultInput = {
   status: 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED'
   noAnswer: boolean
   kind?: Kind
   outcome?: string | null
}

// `neutral` is an answer that is neither good nor bad: the check ran but could not decide.
export type ResultTone = 'success' | 'failure' | 'running' | 'unknown' | 'neutral'

// What a browser test says about itself, in the words of the plan: the verdict, not just "Success" or "Failed".
const BROWSER_TEST_RESULTS: Record<string, { label: string; tone: ResultTone }> = {
   NOT_DETECTED: {
      label: 'Not detected',
      tone: 'success',
   },
   DETECTED: {
      label: 'Detected as a bot',
      tone: 'failure',
   },
   COULD_NOT_TELL: {
      label: 'Could not tell',
      tone: 'neutral',
   },
}

export const resultOf = ({ status, noAnswer, kind, outcome }: ResultInput): { label: string; tone: ResultTone } => {
   if (kind === 'BROWSER_TEST' && status !== 'IN_PROGRESS' && outcome && outcome in BROWSER_TEST_RESULTS) {
      return BROWSER_TEST_RESULTS[outcome]
   }

   if (status === 'SUCCEEDED') {
      return {
         label: 'Success',
         tone: 'success',
      }
   }

   if (status === 'FAILED') {
      return {
         label: 'Failed',
         tone: 'failure',
      }
   }

   return noAnswer
      ? {
           label: 'No answer',
           tone: 'unknown',
        }
      : {
           label: 'In progress',
           tone: 'running',
        }
}

// The site and the page, without the scheme, the query or credentials: enough to see where the browser was.
export const shortAddress = (address: string) => {
   try {
      const { host, pathname } = new URL(address)

      return `${host}${pathname === '/' ? '' : pathname.replace(/\/$/, '')}`
   } catch {
      return address
   }
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

// What the spider did, in a sentence anyone can follow. The selector and the addresses go in the details.
export const describeStep = ({ call, ok, target, urlAfter, length, found, count }: TimelineStep) => {
   const where = (address?: string) => (address ? ` ${shortAddress(address)}` : '')

   switch (call) {
      case 'goto': {
         if (!ok) {
            return `Could not open${where(target)}`
         }

         const landed = urlAfter && target && shortAddress(urlAfter) !== shortAddress(target)

         return `Opened${where(target ?? urlAfter)}${landed ? ` and landed on ${shortAddress(urlAfter)}` : ''}`
      }

      case 'click':
         return ok
            ? `Clicked an element${urlAfter ? ` and moved to ${shortAddress(urlAfter)}` : ''}`
            : 'Could not click the element'

      case 'fill':
         return ok
            ? `Typed ${plural(length ?? 0, 'character', 'characters')} into a field`
            : 'Could not type into the field'

      case 'exists':
         return `Looked for an element and ${found ? 'found it' : 'it was not there'}`

      case 'extract':
         return ok ? `Read ${plural(count ?? 0, 'item', 'items')} from the page` : 'Could not read the page'

      case 'scroll':
         return 'Scrolled down the page'

      case 'cookies':
         return "Collected the browser's session"

      case 'addCookies':
         return 'Loaded the saved browser session'

      default:
         return call
   }
}

// A short next step for a known failure. The sentences are the spider's fixed ones.
export const hintFor = (message: string | null) => {
   if (!message) {
      return undefined
   }

   if (/security check/i.test(message)) {
      return 'LinkedIn wants to confirm it is you. Complete the check on LinkedIn yourself, then try again, ideally through another proxy.'
   }

   if (/does not understand/i.test(message)) {
      return "LinkedIn may have changed this page. If this keeps happening, the spider's selectors need updating."
   }

   if (/did not let the check load/i.test(message)) {
      return 'The page did not load. Check the proxy, or try again through another one.'
   }

   if (/could not be queued/i.test(message)) {
      return 'Try again in a moment.'
   }

   return undefined
}

// The proxy a session ran through, as it was when it ran: no credentials are ever kept with it.
export const proxyLabel = ({
   proxyProtocol,
   proxyHost,
   proxyPort,
}: {
   proxyProtocol: string | null
   proxyHost: string | null
   proxyPort: number | null
}) => (proxyProtocol && proxyHost ? `${proxyProtocol.toLowerCase()}://${proxyHost}:${proxyPort}` : 'No proxy')

export const formatDuration = (ms: number | null) => {
   if (ms === null) {
      return '—'
   }

   if (ms < 1000) {
      return `${ms} ms`
   }

   const seconds = Math.round(ms / 1000)

   if (seconds < 60) {
      return `${seconds} s`
   }

   const rest = seconds % 60

   return `${Math.floor(seconds / 60)} min${rest ? ` ${rest} s` : ''}`
}

export const timeAgo = (from: Date, now = Date.now()) => {
   const seconds = Math.round((now - from.getTime()) / 1000)

   if (seconds < 45) {
      return 'just now'
   }

   const minutes = Math.round(seconds / 60)

   if (minutes < 60) {
      return `${minutes} min ago`
   }

   const hours = Math.round(minutes / 60)

   if (hours < 24) {
      return `${hours} h ago`
   }

   return `${Math.round(hours / 24)} days ago`
}
