import { type AccountBrowse } from '../browsing/types'
import { type AccountStatus } from './types'

import { bucketOf } from '../browsing/overview'
import { type Verdict, rankOf, verdictOf, whyText } from './verdict'

// The search, the client select, the chips and the tools around the list appear from this many accounts; with fewer the list
// is short enough to read.
export const TOOLS_FROM = 4

export const showTools = (count: number) => count >= TOOLS_FROM

export type Chip = 'all' | 'needs' | 'ready' | 'full' | 'near' | 'idle' | 'not-browsing' | 'paused'

export const CHIPS: { chip: Chip; label: string; rule: string }[] = [
   { chip: 'all', label: 'All', rule: 'Every account.' },
   { chip: 'needs', label: 'Needs you', rule: 'Not signed in, or LinkedIn needs something from you.' },
   { chip: 'ready', label: 'Ready', rule: 'Signed in, inside working hours, with time left today.' },
   { chip: 'full', label: 'Full today', rule: "Today's limit is used." },
   { chip: 'near', label: 'Near full', rule: "85% or more of today's limit is used." },
   { chip: 'idle', label: 'Idle', rule: 'Nothing browsed on 3 or more working days in a row.' },
   { chip: 'not-browsing', label: 'Not browsing', rule: 'Paused, signed out or blocked.' },
   { chip: 'paused', label: 'Paused', rule: 'You paused the account.' },
]

// The chips shown in the row; the rest sit in the More menu.
export const MAIN_CHIPS: Chip[] = ['all', 'needs', 'ready']

export const isChip = (value: string | null): value is Chip => CHIPS.some(({ chip }) => chip === value)

export type AccountLike = {
   id: string
   email: string
   displayName: string | null
   status: AccountStatus
   statusMessage: string | null
   lastVerifiedAt: string | Date | null
   nextBrowseAt: string | Date | null
}

export type Row<A extends AccountLike> = {
   account: A
   browse: AccountBrowse | undefined
   verdict: Verdict
   client: string | null
}

export const rowsOf = <A extends AccountLike>(accounts: A[], byId: Map<string, AccountBrowse> | undefined): Row<A>[] =>
   accounts.map(account => {
      const browse = byId?.get(account.id)

      return {
         account,
         browse,
         verdict: verdictOf(account, browse),
         client: browse?.clientLabel ?? null,
      }
   })

export const matchesChip = <A extends AccountLike>(chip: Chip, { account, browse, verdict }: Row<A>) => {
   switch (chip) {
      case 'all':
         return true
      case 'needs':
         return verdict === 'NEEDS_YOU'
      case 'ready':
         return verdict === 'READY'
      case 'paused':
         return account.status === 'DISABLED'
      case 'full':
         return browse !== undefined && bucketOf(browse) === 'FULL'
      case 'near':
         return browse !== undefined && bucketOf(browse) === 'NEAR_FULL'
      case 'idle':
         return browse !== undefined && bucketOf(browse) === 'IDLE'
      default:
         return browse !== undefined && bucketOf(browse) === 'NOT_BROWSING'
   }
}

export const countChips = <A extends AccountLike>(rows: Row<A>[]) => {
   const counts: Record<Chip, number> = {
      all: 0,
      needs: 0,
      ready: 0,
      full: 0,
      near: 0,
      idle: 0,
      'not-browsing': 0,
      paused: 0,
   }

   for (const { chip } of CHIPS) {
      counts[chip] = rows.filter(row => matchesChip(chip, row)).length
   }

   return counts
}

export type Filter = { q: string; client: string; chip: Chip }

export const filterRows = <A extends AccountLike>(rows: Row<A>[], { q, client, chip }: Filter) => {
   const needle = q.trim().toLowerCase()

   return rows.filter(
      row =>
         matchesChip(chip, row) &&
         (client === '' || row.client === client) &&
         (needle === '' ||
            `${row.account.email} ${row.account.displayName ?? ''} ${row.client ?? ''}`.toLowerCase().includes(needle))
   )
}

// Worst first, then by email.
export const sortRows = <A extends AccountLike>(rows: Row<A>[]) =>
   [...rows].sort(
      (a, b) =>
         rankOf(a.verdict, a.browse) - rankOf(b.verdict, b.browse) || a.account.email.localeCompare(b.account.email)
   )

export const clientsOf = <A extends AccountLike>(rows: Row<A>[]) =>
   [...new Set(rows.flatMap(({ client }) => (client ? [client] : [])))].sort((a, b) => a.localeCompare(b))

export type Group<A extends AccountLike> = {
   label: string | null
   rows: Row<A>[]
   usedSeconds: number
   needs: number
}

// Groups that need you first, then the other named clients in order, accounts with no client last.
const groupRank = ({ needs, label }: { needs: number; label: string | null }) =>
   needs > 0 ? 0 : label === null ? 2 : 1

export const groupRows = <A extends AccountLike>(rows: Row<A>[]): Group<A>[] => {
   const labels = [...clientsOf(rows), ...(rows.some(({ client }) => client === null) ? [null] : [])]
   const groups = labels.map(label => {
      const own = rows.filter(({ client }) => client === label)

      return {
         label,
         rows: own,
         usedSeconds: own.reduce((sum, { browse }) => sum + (browse?.usedSeconds ?? 0), 0),
         needs: own.filter(({ verdict }) => verdict === 'NEEDS_YOU').length,
      }
   })

   return groups.sort((a, b) => groupRank(a) - groupRank(b))
}

export type Summary = {
   tone: 'attention' | 'first' | 'fine'
   text: string
   // The account the Fix button opens; none when everything is fine.
   fix: string | null
   // The earliest planned check of a signed-in account after `now`.
   nextAt: Date | null
}

const countText = (count: number, total: number) =>
   total === 1 ? 'This account needs you.' : `${count} of ${total} accounts need you.`

// One sentence for the top of the page: does anything need the owner, and what is the next step.
export const summaryOf = <A extends AccountLike>(rows: Row<A>[], now: Date): Summary | null => {
   if (rows.length === 0) {
      return null
   }

   const needs = sortRows(rows).filter(({ verdict }) => verdict === 'NEEDS_YOU')
   const [worst] = needs

   if (worst) {
      const { account, browse } = worst

      if (needs.length === 1 && account.status === 'PENDING' && !account.lastVerifiedAt) {
         return {
            tone: 'first',
            text: `Next step: press Test login on ${account.email}.`,
            fix: account.id,
            nextAt: null,
         }
      }

      return {
         tone: 'attention',
         text: `${countText(needs.length, rows.length)} ${account.email}: ${whyText(account, browse)}`,
         fix: account.id,
         nextAt: null,
      }
   }

   const times = rows
      .filter(({ account }) => account.status === 'ACTIVE' && account.nextBrowseAt)
      .map(({ account }) => new Date(account.nextBrowseAt ?? 0))
      .filter(date => date.getTime() > now.getTime())
      .sort((a, b) => a.getTime() - b.getTime())

   return {
      tone: 'fine',
      text: rows.length === 1 ? 'The account is fine.' : `All ${rows.length} accounts are fine.`,
      fix: null,
      nextAt: times[0] ?? null,
   }
}
