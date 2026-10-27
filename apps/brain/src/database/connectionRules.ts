import { type Connection, type ConnectionsFile } from '@automatedLinkedIn/contracts'

// What brain decides about the connections of an account once a `linkedin-connections` run has been read: which are new, and what
// became of each one it already knew (.plan/my-connections.md). Pure, so every rule is tested without a database.

export type ConnectionStatus = 'CONNECTED' | 'REMOVING' | 'REMOVED' | 'GONE' | 'UNKNOWN' | 'FAILED'

export type Known = {
   id: string
   slug: string
   status: ConnectionStatus
   sessionId: string | null
}

type Data = {
   status?: ConnectionStatus
   failure?: string | null
   removedAt?: Date | null
   goneAt?: Date | null
}

export type Change = {
   // The row to change; none for a connection seen for the first time.
   id?: string
   // What the page showed of the connection, when it was listed in this read.
   connection?: Connection & { position: number }
   data: Data
}

export const UNSURE_SENTENCE = 'LinkedIn did not show whether the removal took. Read the connections again to check.'

const BACK_TO_CONNECTED: Data = {
   status: 'CONNECTED',
   failure: null,
   goneAt: null,
   removedAt: null,
}

type Context = {
   sessionId: string
   verdict: string | null
   now: Date
}

// What the run said of the connection it was asked to remove; undefined when it said nothing that changes the row.
const outcomeOf = (row: Known, file: ConnectionsFile, { sessionId, verdict, now }: Context): Data | undefined => {
   if (row.sessionId !== sessionId || file.removal?.slug !== row.slug) {
      return undefined
   }

   switch (file.removal.outcome) {
      case 'REMOVED':
         return {
            status: 'REMOVED',
            failure: null,
            removedAt: now,
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
      default:
         // A command delivered twice says NOT_CLICKED while the first delivery may have pressed Remove: that stays unsure.
         return verdict === 'UNKNOWN'
            ? undefined
            : {
                 status: 'CONNECTED',
                 failure: null,
              }
   }
}

// What becomes of a connection the run did not settle. Listed: it is connected (a removal on its way stays as it is). Not listed: gone,
// but only when the read was complete, since a list that was cut or had a row it could not read says nothing about the people it left out.
const unsettledOf = (row: Known, listed: boolean, complete: boolean, now: Date): Data | undefined => {
   if (listed) {
      return row.status === 'CONNECTED' || row.status === 'REMOVING' ? {} : BACK_TO_CONNECTED
   }

   if (!complete) {
      return undefined
   }

   if (row.status === 'CONNECTED') {
      return {
         status: 'GONE',
         goneAt: now,
      }
   }

   // It left the list after Remove was pressed: the press is the last thing known to have happened to it.
   return row.status === 'UNKNOWN'
      ? {
           status: 'REMOVED',
           failure: null,
           removedAt: now,
        }
      : undefined
}

// What a read of the list changes: the connections seen for the first time, and the state of each one already known.
export const planStore = (known: Known[], file: ConnectionsFile, context: Context): Change[] => {
   const listed = new Map(
      file.connections.map((connection, position) => [
         connection.slug,
         {
            ...connection,
            position,
         },
      ])
   )
   const changes: Change[] = []
   const have = new Set(known.map(({ slug }) => slug))

   for (const [slug, connection] of listed) {
      if (!have.has(slug)) {
         changes.push({
            connection,
            data: {},
         })
      }
   }

   for (const row of known) {
      const connection = listed.get(row.slug)
      const data =
         outcomeOf(row, file, context) ?? unsettledOf(row, connection !== undefined, file.complete, context.now)

      if (data) {
         changes.push({
            id: row.id,
            ...(connection && { connection }),
            data,
         })
      }
   }

   return changes
}
