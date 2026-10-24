import { timeAgo } from '../../lib/time-ago'

import { type AccountStatus } from '../accounts/types'

// A link to a profile as a person pastes it: with or without the scheme, any LinkedIn host, anything after the name. Brain checks it
// again; this only keeps the button off for text that cannot be one.
const isLinkTo = (path: 'in' | 'company', text: string) =>
   new RegExp(`^(?:https?://)?(?:[\\w-]+\\.)?linkedin\\.com/${path}/[^/\\s?#]{2,}`, 'i').test(text.trim())

export const isProfileLink = (text: string) => isLinkTo('in', text)

export const isCompanyLink = (text: string) => isLinkTo('company', text)

const BLOCKERS: Partial<Record<AccountStatus, string>> = {
   DISABLED: 'Paused. Resume it first.',
   BLOCKED: 'LinkedIn restricted this account.',
}

type Choosable = {
   id: string
   email: string
   status: AccountStatus
}

// The accounts the owner may view a page with: the ones that are signed in; the others say why not.
export const accountChoices = (accounts: Choosable[]) =>
   accounts.map(({ id, email, status }) => {
      const blocker = status === 'ACTIVE' ? undefined : (BLOCKERS[status] ?? 'Not signed in. Run Test login first.')

      return blocker ? { id, email, blocker } : { id, email }
   })

export const visitedText = (
   visit: { createdAt: string; account: { email: string } } | undefined,
   now: Date = new Date()
) => (visit ? `Viewed ${timeAgo(visit.createdAt, now)} by ${visit.account.email}` : undefined)
