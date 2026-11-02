import { type TemplateValues, humanAgo, humanDate } from '@automatedLinkedIn/contracts'

import { type Signal } from './workflowItem'

// What we know about one person, from wherever it is kept; `templateValues` turns it into the variables of a message
// (.plan/message-composer.md). Every field may be missing.

export type PersonFacts = {
   name?: string | null
   headline?: string | null
   location?: string | null
   company?: string | null
   title?: string | null
   connectedAt?: Date | string | null
   // What the person wrote with their own connection request.
   theirNote?: string | null
   about?: string | null
   experience?: Array<{ title: string | null; company: string | null; end: string | null }>
   education?: Array<{ school: string | null }>
   skills?: string[]
   signals?: Signal[]
}

const NOT_NAMES = new Set(['unknown', 'linkedin'])
const ABOUT_CHARS = 120

const some = (value: string | null | undefined) => (value?.trim() ? value.trim() : undefined)

const nameParts = (name: string | null | undefined, slug: string) => {
   const full = some(name)

   if (!full || full === slug || NOT_NAMES.has(full.toLowerCase())) {
      return {}
   }

   const [first, ...rest] = full.split(/\s+/)

   return {
      first,
      last: rest.join(' ') || undefined,
      full,
   }
}

const ongoing = (end: string | null) => end === null || /present|now/i.test(end)

// The first sentence, or the first words when there is none, never more than 120 characters.
export const aboutSnippet = (about: string | null | undefined) => {
   const text = some(about)?.replace(/\s+/g, ' ')

   if (!text) {
      return undefined
   }

   const sentence = /^.*?[.!?](?=\s|$)/.exec(text)?.[0] ?? text

   if (sentence.length <= ABOUT_CHARS) {
      return sentence
   }

   const cut = sentence.slice(0, ABOUT_CHARS)

   return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 1)).trimEnd()}…`
}

// The newest signal of a kind: by its time when it has one, else the first.
const newest = (signals: Signal[], type: Signal['type']) =>
   signals
      .filter(signal => signal.type === type)
      .sort((a, b) => (b.at ? Date.parse(b.at) : 0) - (a.at ? Date.parse(a.at) : 0))[0]

export const templateValues = (
   facts: PersonFacts,
   options: { slug: string; accountFirstName?: string | null; now?: Date }
): TemplateValues => {
   const { first, last, full } = nameParts(facts.name, options.slug)
   const roles = facts.experience ?? []
   const current = roles.find(role => ongoing(role.end))
   const company = some(facts.company) ?? some(current?.company)
   const previous = roles.find(
      role => !ongoing(role.end) && some(role.company) && role.company?.toLowerCase() !== company?.toLowerCase()
   )
   const signals = facts.signals ?? []
   const commented = newest(signals, 'commented')
   const reacted = newest(signals, 'reacted')
   const now = options.now ?? new Date()

   return {
      first_name: first,
      last_name: last,
      full_name: full,
      headline: some(facts.headline),
      location: some(facts.location),
      about_snippet: aboutSnippet(facts.about),
      top_skill: some(facts.skills?.[0]),
      school: some(facts.education?.[0]?.school),
      company,
      title: some(facts.title) ?? some(current?.title),
      previous_company: some(previous?.company),
      previous_title: some(previous?.title),
      commented_on: some(commented?.post?.author.name),
      comment_excerpt: some(commented?.excerpt),
      reacted_to: some(reacted?.post?.author.name),
      their_note: some(facts.theirNote),
      connected_date: facts.connectedAt ? (humanDate(facts.connectedAt) ?? undefined) : undefined,
      connected_ago: facts.connectedAt ? (humanAgo(facts.connectedAt, now) ?? undefined) : undefined,
      commented_date: commented?.at ? (humanDate(commented.at) ?? undefined) : undefined,
      commented_ago: commented?.at ? (humanAgo(commented.at, now) ?? undefined) : undefined,
      reacted_date: reacted?.at ? (humanDate(reacted.at) ?? undefined) : undefined,
      reacted_ago: reacted?.at ? (humanAgo(reacted.at, now) ?? undefined) : undefined,
      account_first_name: some(options.accountFirstName),
   }
}
