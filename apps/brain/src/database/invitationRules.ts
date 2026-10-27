import { type Invitation, type InvitationAction, type InvitationsFile } from '@automatedLinkedIn/contracts'

// What brain decides about the connection requests of an account once a `linkedin-invitations` run has been read: which are new,
// and what became of each one it already knew (.plan/my-network-invitations.md). Pure, so every rule is tested without a database.

export type InvitationStatus = 'PENDING' | 'QUEUED' | 'ACCEPTED' | 'IGNORED' | 'GONE' | 'FAILED' | 'UNKNOWN'

export type Known = {
   id: string
   linkedInId: string
   status: InvitationStatus
   action: InvitationAction | null
   sessionId: string | null
}

type Data = {
   status?: InvitationStatus
   action?: InvitationAction | null
   failure?: string | null
   answeredAt?: Date | null
   goneAt?: Date | null
}

export type Change = {
   // The row to change; none for a request seen for the first time.
   id?: string
   // What the page showed of the request, when it was listed in this read.
   invitation?: Invitation & { position: number }
   data: Data
}

export const UNSURE_SENTENCE = 'LinkedIn did not show whether this took. Read the requests again to check.'

const RESULT_OF: Record<InvitationAction, InvitationStatus> = {
   ACCEPT: 'ACCEPTED',
   IGNORE: 'IGNORED',
}

const BACK_TO_PENDING: Data = {
   status: 'PENDING',
   action: null,
   failure: null,
   goneAt: null,
}

// The verdicts after which nothing was clicked: ours that say so, and the runner's that end a task before it starts. Any other
// answer (a timeout, a crash, a lost proxy) may have come after a click, so the requests it was asked to answer are unsure.
export const NOT_DONE = new Set([
   'ERROR',
   'SIGNED_OUT',
   'UNKNOWN_TASK',
   'INVALID_INPUT',
   'NEEDS_PROXY',
   'NEEDS_ACCOUNT',
   'NOT_ALLOWED',
   'NOT_QUEUED',
   'NOT_STARTED',
   'CANCELLED',
])

// The verdicts of a run that can have handed over a file: a read that went, or an answer that may have taken.
export const HANDS_OVER = new Set(['DONE', 'PARTIAL', 'UNKNOWN', 'SIGNED_OUT'])

type Context = {
   sessionId: string
   verdict: string | null
   now: Date
}

// What the run said of a request it was asked to answer; undefined when it said nothing that changes the row.
const outcomeOf = (row: Known, file: InvitationsFile, { sessionId, verdict, now }: Context): Data | undefined => {
   if (row.sessionId !== sessionId) {
      return undefined
   }

   const said = file.outcomes.find(({ id }) => id === row.linkedInId)

   switch (said?.outcome) {
      case 'ACCEPTED':
      case 'IGNORED':
         return {
            status: RESULT_OF[said.action],
            action: said.action,
            failure: null,
            answeredAt: now,
         }
      case 'GONE':
         return {
            status: 'GONE',
            failure: null,
            goneAt: now,
         }
      case 'UNSURE':
         return {
            status: 'UNKNOWN',
            failure: UNSURE_SENTENCE,
         }
      case 'NOT_CLICKED':
         // A command delivered twice answers NOT_CLICKED for all, while the first delivery may have clicked: that stays unsure.
         return verdict === 'UNKNOWN' && !file.outcomes.some(({ outcome }) => outcome === 'UNSURE')
            ? undefined
            : {
                 status: 'PENDING',
                 action: null,
                 failure: null,
              }
      default:
         return undefined
   }
}

// What becomes of a request the run did not answer. Listed: it waits for the owner (one whose answer is on its way stays as it is).
// Not listed: gone, but only when the read was complete, since a list that was cut or had a row it could not read says nothing about
// the requests it left out.
const unansweredOf = (row: Known, listed: boolean, complete: boolean, now: Date): Data | undefined => {
   if (listed) {
      return row.status === 'PENDING' || row.status === 'QUEUED' ? {} : BACK_TO_PENDING
   }

   if (!complete) {
      return undefined
   }

   if (row.status === 'PENDING') {
      return {
         status: 'GONE',
         goneAt: now,
      }
   }

   // It left the page after it was clicked: the click is the last thing known to have happened to it.
   return row.status === 'UNKNOWN' && row.action
      ? {
           status: RESULT_OF[row.action],
           failure: null,
           answeredAt: now,
        }
      : undefined
}

// What a read of the list changes: the requests seen for the first time, and the state of each one already known.
export const planStore = (known: Known[], file: InvitationsFile, context: Context): Change[] => {
   const listed = new Map(
      file.invitations.map((invitation, position) => [
         invitation.id,
         {
            ...invitation,
            position,
         },
      ])
   )
   const changes: Change[] = []
   const have = new Set(known.map(({ linkedInId }) => linkedInId))

   for (const [linkedInId, invitation] of listed) {
      if (!have.has(linkedInId)) {
         changes.push({
            invitation,
            data: {},
         })
      }
   }

   for (const row of known) {
      const invitation = listed.get(row.linkedInId)
      const data =
         outcomeOf(row, file, context) ?? unansweredOf(row, invitation !== undefined, file.complete, context.now)

      if (data) {
         changes.push({
            id: row.id,
            ...(invitation && { invitation }),
            data,
         })
      }
   }

   return changes
}
