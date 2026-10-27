import type { PublicationState } from './publication'

// The pure rules of the Write a post landing page (.plan/posting-landing-agencies.md): which tab a post is under, which accounts
// can write, which are quiet, and what a filter keeps.

export type Tab = 'drafts' | 'planned' | 'posted' | 'failed'

export const TABS: { id: Tab; label: string }[] = [
   { id: 'drafts', label: 'Drafts' },
   { id: 'planned', label: 'Planned' },
   { id: 'posted', label: 'Posted' },
   { id: 'failed', label: 'Not posted' },
]

export const isTab = (value: string | null): value is Tab => TABS.some(({ id }) => id === value)

export const tabOfState = (state: PublicationState): Exclude<Tab, 'drafts'> =>
   state === 'POSTED' ? 'posted' : state === 'FAILED' || state === 'UNKNOWN' ? 'failed' : 'planned'

// What needs the owner first: a post that did not go, then drafts to finish, then what is planned, then what went.
export const defaultTab = (counts: Record<Tab, number>): Tab =>
   (['failed', 'drafts', 'planned', 'posted'] as const).find(tab => counts[tab] > 0) ?? 'drafts'

export type Scope = { kind: 'all' } | { kind: 'client'; label: string } | { kind: 'account'; id: string }

const ALL: Scope = { kind: 'all' }

export const scopeValue = (scope: Scope) =>
   scope.kind === 'client' ? `client:${scope.label}` : scope.kind === 'account' ? `account:${scope.id}` : 'all'

// The address and the select speak in strings; anything that is not understood means every account.
export const parseScope = (value: string | null): Scope => {
   if (value?.startsWith('client:') && value.length > 'client:'.length) {
      return { kind: 'client', label: value.slice('client:'.length) }
   }

   if (value?.startsWith('account:') && value.length > 'account:'.length) {
      return { kind: 'account', id: value.slice('account:'.length) }
   }

   return ALL
}

export type Labels = ReadonlyMap<string, string | null>

const inScope = (scope: Scope, accountId: string, labels: Labels) =>
   scope.kind === 'all' || (scope.kind === 'account' ? scope.id === accountId : labels.get(accountId) === scope.label)

type Filter = { scope: Scope; search: string; labels: Labels }

// The rows of the chosen account or client whose words hold what was typed (not case sensitive).
export const filterRows = <T>(
   rows: T[],
   of: (row: T) => { accountId: string; text: string },
   { scope, search, labels }: Filter
) => {
   const needle = search.trim().toLowerCase()

   return rows.filter(row => {
      const { accountId, text } = of(row)

      return inScope(scope, accountId, labels) && (needle === '' || text.toLowerCase().includes(needle))
   })
}

export const clientLabels = (labels: Labels) =>
   [...new Set([...labels.values()].filter((label): label is string => Boolean(label)))].sort((a, b) =>
      a.localeCompare(b)
   )

// A scope from the address that names an account or client the owner does not have means every account.
export const knownScope = (scope: Scope, accounts: Array<{ id: string }>, labels: Labels): Scope =>
   (scope.kind === 'account' && !accounts.some(({ id }) => id === scope.id)) ||
   (scope.kind === 'client' && !clientLabels(labels).includes(scope.label))
      ? ALL
      : scope

type AccountState = { id: string; status: string }

export const readyAccounts = <T extends AccountState>(accounts: T[]) =>
   accounts.filter(({ status }) => status === 'ACTIVE')

const DAY_MS = 24 * 60 * 60 * 1000
export const QUIET_DAYS = 7

type Dated = { accountId: string; state: PublicationState; postedAt: string | null }

// The ready accounts with no post that went in the last week and none planned or on its way. Only a hint to write.
export const quietAccounts = <T extends AccountState>(accounts: T[], posts: Dated[], now: number) => {
   const since = now - QUIET_DAYS * DAY_MS

   return readyAccounts(accounts).filter(({ id }) =>
      posts.every(
         post =>
            post.accountId !== id ||
            (post.state === 'POSTED'
               ? new Date(post.postedAt ?? 0).getTime() < since
               : post.state !== 'SCHEDULED' && post.state !== 'QUEUED' && post.state !== 'SENDING')
      )
   )
}

export const STARTERS = [
   {
      id: 'win',
      label: 'A customer win',
      text: 'A customer win\n\nWho they are:\nTheir problem before we worked together:\nWhat we did:\nThe result, with a number:\n',
   },
   {
      id: 'problem',
      label: 'A problem you solve',
      text: 'A problem I see every week\n\nWho has it:\nWhat it costs them:\nHow I solve it:\nWhat to do first:\n',
   },
   {
      id: 'lesson',
      label: 'A lesson from this week',
      text: 'One thing I learned this week\n\nWhat happened:\nWhat I got wrong:\nWhat I do now:\n',
   },
   {
      id: 'question',
      label: 'A question for your audience',
      text: 'A question for people who do this work\n\nThe question:\nWhy I am asking:\nWhat I will do with the answers:\n',
   },
] as const

export type Starter = (typeof STARTERS)[number]
