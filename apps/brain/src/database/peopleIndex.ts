import { type PersonFit, type PersonLinkKind, type PersonStatus } from 'generated/prisma/client'

// The pure part of My network's index (.plan/network-hub.md): from the rows that tie one profile to the owner, one draft person
// per client. Tested without a database.

export type RequestRow = {
   id: string
   accountId: string
   name: string
   headline: string
   photoUrl: string | null
   note: string | null
   status: string
   seenAt: Date
   createdAt: Date
}

export type ConnectionRow = {
   id: string
   accountId: string
   name: string
   headline: string
   photoUrl: string | null
   status: string
   connectedOn: Date | null
   seenAt: Date
   createdAt: Date
}

export type ConversationRow = {
   id: string
   accountId: string
   name: string | null
   photoUrl: string | null
   lastMessageAt: Date | null
   lastDirection: 'ME' | 'THEM' | null
   lastReplyAt: Date | null
   waitingSince: Date | null
   doneAt: Date | null
   // Their newest words, when the last message is theirs.
   lastText: string | null
   createdAt: Date
}

export type MemberRow = {
   id: string
   listId: string
   clientId: string | null
   name: string | null
   headline: string | null
   company: string | null
   state: 'QUALIFIED' | 'MAYBE' | 'UNSCORED'
   status: string
   score: number | null
   postUrl: string | null
   url: string
   // The first signal: what they did, where, and their own words.
   signal: { type: string; via: string; excerpt: string | null; at: string | null } | null
   createdAt: Date
}

export type TargetRow = {
   id: string
   clientId: string | null
   name: string | null
   headline: string | null
   company: string | null
   status: string
   url: string
   createdAt: Date
}

export type Sources = {
   requests: RequestRow[]
   connections: ConnectionRow[]
   conversations: ConversationRow[]
   members: MemberRow[]
   targets: TargetRow[]
}

export type DraftLink = {
   accountId: string | null
   kind: PersonLinkKind
   sourceId: string
   at: Date
}

export type DraftPerson = {
   clientId: string
   name: string | null
   headline: string | null
   company: string | null
   photoUrl: string | null
   // The status the rows say; a status the owner chose wins over it.
   status: PersonStatus
   fit: PersonFit
   score: number | null
   reasonKind: PersonLinkKind
   reasonText: string | null
   reasonUrl: string | null
   reasonAt: Date
   foundBy: string[]
   priority: number
   waiting: boolean
   lastTouchAt: Date
   firstSeenAt: Date
   links: DraftLink[]
}

const STATUS_OF_MEMBER: Record<string, PersonStatus> = {
   CONTACTED: 'CONTACTED',
   REPLIED: 'REPLIED',
   NOT_A_FIT: 'NOT_INTERESTED',
   DONE: 'DONE',
}

const STATUS_OF_TARGET: Record<string, PersonStatus> = {
   CONTACTED: 'CONTACTED',
   REPLIED: 'REPLIED',
}

const RANK: Record<PersonStatus, number> = {
   NEW: 0,
   CONTACTED: 1,
   REPLIED: 2,
   NOT_INTERESTED: 3,
   DONE: 3,
}

const SIGNAL_WORDS: Record<string, string> = {
   commented: 'Commented',
   reacted: 'Reacted to a post',
   employee: 'Works at',
   hiring: 'Hiring at',
}

const latest = (dates: Array<Date | null | undefined>) =>
   dates.reduce<Date | null>((best, date) => (date && (!best || date > best) ? date : best), null)

const earliest = (dates: Date[]) => dates.reduce((best, date) => (date < best ? date : best))

const higher = (a: PersonStatus, b: PersonStatus) => (RANK[b] > RANK[a] ? b : a)

const pending = (row: RequestRow) => row.status === 'PENDING' || row.status === 'QUEUED'

const connected = (row: ConnectionRow) => row.status === 'CONNECTED' || row.status === 'REMOVING'

const open = (row: ConversationRow) => row.doneAt === null

type Rows = { [K in keyof Sources]: Sources[K] }

const emptyRows = (): Rows => ({
   requests: [],
   connections: [],
   conversations: [],
   members: [],
   targets: [],
})

const memberReason = (member: MemberRow) => {
   const { signal } = member

   if (!signal) {
      return {
         text: 'Added to a list',
         url: member.postUrl,
      }
   }

   const words = SIGNAL_WORDS[signal.type] ?? 'Found'

   return {
      text: signal.excerpt ? `${words}: "${signal.excerpt}"` : `${words} ${signal.via}`.trim(),
      url: member.postUrl ?? (signal.via.startsWith('https://') ? signal.via : null),
   }
}

// One client's rows for a profile into one person: the most useful reason first (a reply, a request, why a list found them,
// the connection, the target), the best fit, the status the rows say, and what waits on whom.
const draftOf = (clientId: string, rows: Rows, profileUrl: string): DraftPerson => {
   const reply = rows.conversations.find(row => open(row) && row.lastDirection === 'THEM')
   const request = rows.requests.find(pending)
   const member = rows.members[0]
   const connection = rows.connections.find(connected)
   const target = rows.targets[0]
   const [first] = [...rows.connections, ...rows.requests, ...rows.conversations]
   const reason = (() => {
      if (reply) {
         return {
            kind: 'CONVERSATION' as const,
            text: reply.lastText ? `Replied: "${reply.lastText}"` : 'Replied to you',
            url: null,
            at: reply.lastMessageAt ?? reply.createdAt,
         }
      }

      if (request) {
         return {
            kind: 'REQUEST' as const,
            text: request.note ? `Sent you a request: "${request.note}"` : 'Sent you a request',
            url: null,
            at: request.seenAt,
         }
      }

      if (member) {
         return {
            kind: 'LIST_MEMBER' as const,
            ...memberReason(member),
            at: member.createdAt,
         }
      }

      if (connection) {
         return {
            kind: 'CONNECTION' as const,
            text: 'Connected',
            url: null,
            at: connection.connectedOn ?? connection.seenAt,
         }
      }

      if (target) {
         return {
            kind: 'TARGET' as const,
            text: 'Target profile',
            url: null,
            at: target.createdAt,
         }
      }

      return {
         kind: 'CONVERSATION' as const,
         text: 'Messaged',
         url: null,
         at: rows.conversations[0]?.lastMessageAt ?? rows.conversations[0]?.createdAt ?? new Date(0),
      }
   })()
   const fromRows = [
      ...rows.members.map(row => STATUS_OF_MEMBER[row.status] ?? 'NEW'),
      ...rows.targets.map(row => STATUS_OF_TARGET[row.status] ?? 'NEW'),
      ...rows.conversations.map(row =>
         row.lastReplyAt && row.waitingSince ? 'REPLIED' : row.lastReplyAt ? 'CONTACTED' : 'NEW'
      ),
   ].reduce<PersonStatus>(higher, 'NEW')
   const scores = rows.members.flatMap(row => (row.score === null ? [] : [row.score]))
   const links: DraftLink[] = [
      ...rows.requests.map(row => ({
         accountId: row.accountId,
         kind: 'REQUEST' as const,
         sourceId: row.id,
         at: row.seenAt,
      })),
      ...rows.connections.map(row => ({
         accountId: row.accountId,
         kind: 'CONNECTION' as const,
         sourceId: row.id,
         at: row.connectedOn ?? row.seenAt,
      })),
      ...rows.conversations.map(row => ({
         accountId: row.accountId,
         kind: 'CONVERSATION' as const,
         sourceId: row.id,
         at: row.lastMessageAt ?? row.createdAt,
      })),
      ...rows.members.map(row => ({
         accountId: null,
         kind: 'LIST_MEMBER' as const,
         sourceId: row.id,
         at: row.createdAt,
      })),
      ...rows.targets.map(row => ({
         accountId: null,
         kind: 'TARGET' as const,
         sourceId: row.id,
         at: row.createdAt,
      })),
   ]
   const seen = [
      ...rows.requests.map(row => row.createdAt),
      ...rows.connections.map(row => row.createdAt),
      ...rows.conversations.map(row => row.createdAt),
      ...rows.members.map(row => row.createdAt),
      ...rows.targets.map(row => row.createdAt),
   ]

   return {
      clientId,
      name: first?.name ?? member?.name ?? target?.name ?? null,
      headline: connection?.headline ?? request?.headline ?? member?.headline ?? target?.headline ?? null,
      company: member?.company ?? target?.company ?? null,
      photoUrl:
         rows.connections.find(row => row.photoUrl)?.photoUrl ??
         rows.requests.find(row => row.photoUrl)?.photoUrl ??
         rows.conversations.find(row => row.photoUrl)?.photoUrl ??
         null,
      status: fromRows,
      fit: rows.members.some(row => row.state === 'QUALIFIED')
         ? 'STRONG'
         : rows.members.some(row => row.state === 'MAYBE')
           ? 'MAYBE'
           : 'NONE',
      score: scores.length > 0 ? Math.max(...scores) : null,
      reasonKind: reason.kind,
      reasonText: reason.text,
      reasonUrl: reason.url ?? (reason.kind === 'TARGET' ? profileUrl : null),
      reasonAt: reason.at,
      foundBy: [
         ...(rows.requests.length > 0 ? ['request'] : []),
         ...(rows.connections.some(connected) ? ['connection'] : []),
         ...(rows.targets.length > 0 ? ['target'] : []),
         ...new Set(rows.members.map(row => `list:${row.listId}`)),
      ],
      priority: reply ? 2 : request ? 1 : 0,
      waiting: rows.conversations.some(row => open(row) && row.lastDirection === 'ME'),
      lastTouchAt:
         latest([
            ...rows.conversations.map(row => row.lastMessageAt),
            ...rows.requests.map(row => row.seenAt),
            ...rows.connections.map(row => row.connectedOn ?? row.createdAt),
            ...rows.members.map(row => row.createdAt),
            ...rows.targets.map(row => row.createdAt),
         ]) ?? new Date(0),
      firstSeenAt: earliest(seen),
      links,
   }
}

// Groups one profile's rows by client: an account's rows go to the account's client, a list's and a target's to theirs, and
// rows without one to the owner's default client.
export const draftPeople = (
   sources: Sources,
   clientOfAccount: (accountId: string) => string,
   defaultClientId: string,
   profileUrl: string
): DraftPerson[] => {
   const byClient = new Map<string, Rows>()
   const rowsOf = (clientId: string) => {
      const found = byClient.get(clientId) ?? emptyRows()

      byClient.set(clientId, found)

      return found
   }

   sources.requests.forEach(row => rowsOf(clientOfAccount(row.accountId)).requests.push(row))
   sources.connections.forEach(row => rowsOf(clientOfAccount(row.accountId)).connections.push(row))
   sources.conversations.forEach(row => rowsOf(clientOfAccount(row.accountId)).conversations.push(row))
   sources.members.forEach(row => rowsOf(row.clientId ?? defaultClientId).members.push(row))
   sources.targets.forEach(row => rowsOf(row.clientId ?? defaultClientId).targets.push(row))

   return [...byClient].map(([clientId, rows]) => draftOf(clientId, rows, profileUrl))
}
