export type PublicationState = 'SCHEDULED' | 'QUEUED' | 'SENDING' | 'POSTED' | 'FAILED' | 'UNKNOWN'

const TEXT: Record<PublicationState, string> = {
   SCHEDULED: 'Planned',
   QUEUED: 'Waiting to start',
   SENDING: 'Posting now',
   POSTED: 'Posted',
   FAILED: 'Not posted',
   UNKNOWN: 'Not sure if it was posted',
}

export const stateText = (state: PublicationState) => TEXT[state]

// A post that is sending or went cannot be taken back; the others can, to be cancelled or edited and sent again.
export const canTakeBack = (state: PublicationState) => state !== 'SENDING' && state !== 'POSTED'

// Whether the list should be asked again soon: a post is planned, waiting or being posted.
export const hasActive = (posts: Array<{ state: PublicationState }> | undefined) =>
   posts?.some(({ state }) => state === 'SCHEDULED' || state === 'QUEUED' || state === 'SENDING') ?? false

const POST_LINK = /^\/feed\/update\/urn:li:(?:activity|share|ugcPost):\d{10,25}\/?$/

// The same check as `postLinkOf` in the contract (it cannot be imported here, see rules.ts; `publication.unit.test.ts` fails when the
// two differ): only the address of a post on LinkedIn is shown as a link.
export const isPostLink = (value: string | null) => {
   if (!value || !URL.canParse(value)) {
      return false
   }

   const { protocol, hostname, pathname } = new URL(value)

   return protocol === 'https:' && hostname === 'www.linkedin.com' && POST_LINK.test(pathname)
}

export type Waiting = { reason: string; until: string | null; zone: string | null }

type When = { now?: number; localZone?: string; locale?: string }

const clockOf = (at: Date, locale: string | undefined, timeZone: string | undefined) =>
   new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      ...(timeZone && { timeZone }),
   }).format(at)

const dayOf = (at: Date, timeZone: string | undefined) =>
   new Intl.DateTimeFormat('en-CA', { dateStyle: 'short', ...(timeZone && { timeZone }) }).format(at)

// "08:28 New York", or nothing when the zone is unknown to the browser or is the viewer's own.
const accountClock = (at: Date, zone: string | null, localZone: string | undefined, locale: string | undefined) => {
   if (!zone || zone === localZone) {
      return undefined
   }

   try {
      const city = zone.split('/').at(-1)?.replaceAll('_', ' ') ?? zone

      return `${clockOf(at, locale, zone)} ${city}`
   } catch {
      return undefined
   }
}

// Why a queued post waits and, when brain knows, when it can start: in the viewer's time, in the account's working-hours zone, and
// as a rough wait. The time is the earliest brain asks again, not a promise.
export const waitingText = ({ reason, until, zone }: Waiting, { now = Date.now(), localZone, locale }: When = {}) => {
   if (!until) {
      return reason
   }

   const at = new Date(until)
   const own = localZone ?? new Intl.DateTimeFormat().resolvedOptions().timeZone
   const minutes = Math.ceil((at.getTime() - now) / 60_000)
   const wait = minutes <= 0 ? 'any moment now' : minutes < 60 ? `in about ${minutes} min` : `in about ${Math.round(minutes / 60)} h`
   const sameDay = dayOf(at, own) === dayOf(new Date(now), own)
   const clock = clockOf(at, locale, own)
   const when = sameDay
      ? `at ${clock}`
      : `on ${new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: own }).format(at)} ${clock}`
   const theirs = accountClock(at, zone, own, locale)
   const label = zone === own ? '' : theirs ? ` your time (${theirs})` : ' your time'

   return `${reason} It can start ${when}${label}, ${wait}.`
}
