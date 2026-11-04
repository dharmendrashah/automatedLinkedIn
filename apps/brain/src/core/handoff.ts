import { toCsv } from './csv'
import { REASONS } from './itemCsv'
import { type PersonItem } from './workflowItem'

// The hand-off file (.plan/lead-pipeline-p1-foundations.md): what a person who takes over a lead needs, and nothing that is private.
// No chat text, no phone, and no LinkedIn link: the link in it opens the person in this app, for the owner, signed in.

export type HandoffRow = {
   slug: string
   name: string | null
   title: string | null
   company: string | null
   domain: string | null
   email: string | null
   invitedOn: Date | null
   acceptedOn: Date | null
   firstMessageOn: Date | null
   daysWaiting: number | null
   engagedWith: string | null
   score: number | null
}

export const HANDOFF_HEADER = [
   'Link',
   'Name',
   'Title',
   'Company',
   'Domain',
   'Work email',
   'Invited on',
   'Accepted on',
   'First message on',
   'Days waiting',
   'Engaged with',
   'Score',
]

const DAY_MS = 24 * 60 * 60 * 1000

// Where a person opens in the app: the address of the web app and the person's identifier.
export const appLink = (appUrl: string, slug: string) =>
   `${appUrl.replace(/\/+$/, '')}/network?open=${encodeURIComponent(slug)}`

const dayOf = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null)

// Whole days since the owner last waited for an answer; null when nobody is waited for.
export const daysSince = (since: Date | null | undefined, now: Date) =>
   since ? Math.max(0, Math.floor((now.getTime() - since.getTime()) / DAY_MS)) : null

// What a run knows of a person it hands off: one sentence from the first thing they did, such as "Commented: great point".
export const handoffInputOf = (item: PersonItem) => {
   const [signal] = item.signals

   return {
      slug: item.slug,
      name: item.name,
      title: item.title,
      company: item.company,
      domain: item.companyDomain ?? null,
      email: item.email ?? null,
      engagedWith: signal ? [REASONS[signal.type], signal.excerpt].filter(Boolean).join(': ') : null,
      score: item.score,
   }
}

export const handoffCsv = (appUrl: string, rows: HandoffRow[]) =>
   toCsv(
      HANDOFF_HEADER,
      rows.map(row => [
         appLink(appUrl, row.slug),
         row.name,
         row.title,
         row.company,
         row.domain,
         row.email,
         dayOf(row.invitedOn),
         dayOf(row.acceptedOn),
         dayOf(row.firstMessageOn),
         row.daysWaiting === null ? null : String(row.daysWaiting),
         row.engagedWith,
         row.score === null ? null : String(row.score),
      ])
   )
