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
