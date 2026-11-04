import { ICP_WEIGHTS, type IcpRules, bandOf, contains, scoreIcp } from './icpScore'

import {
   COMPANY_SIGNAL_TYPES,
   type CompanySignalType,
   type RankModel,
   SIGNAL_LABELS,
   type SignalType,
   type Tier,
   type TierLines,
   fadeFactor,
   tierOf,
} from '@automatedLinkedIn/contracts'

// How a person and a company are ranked (.plan/lead-pipeline-p7-ranking.md): fit from the ideal customer, intent from signals that fade,
// reach from how much they are heard, relationship from what we share. Pure: the block reads the stored signals and calls this.

const DAY_MS = 24 * 60 * 60 * 1000

const RELATIONSHIP: SignalType[] = ['shared', 'mutual']

export type RankSignal = { type: SignalType; at: Date }

export type RankPerson = {
   headline: string | null
   title: string | null
   location: string | null
   company: string | null
   companyIndustry: string | null
   companySize: string | null
   followers: number | null
   // The full profile was read: without it a person cannot reach tier A.
   read: boolean
   signals: RankSignal[]
}

export type Never = { titles: string[]; companies: string[] }

export type Ranked = {
   excluded: string | null
   score: number
   tier: Tier
   parts: { fit: number; intent: number; reach: number; relationship: number }
   matched: string[]
}

const words = (text: string, phrase: string) => contains(text.toLowerCase(), phrase)

// The most the ideal customer can give from the criteria it has; industry and size only once the profile was read.
const fitMax = (rules: IcpRules, read: boolean) =>
   (rules.includeTitles.length > 0 ? ICP_WEIGHTS.title : 0) +
   (rules.seniorities.length > 0 ? ICP_WEIGHTS.seniority : 0) +
   (rules.locations.length > 0 ? ICP_WEIGHTS.location : 0) +
   (read && (rules.industries ?? []).length > 0 ? ICP_WEIGHTS.industry : 0) +
   (read && (rules.companySizes ?? []).length > 0 ? ICP_WEIGHTS.companySize : 0)

// Each type counts once, by its freshest signal, so ten comments are not ten times a comment. A signal dated after now counts for nothing.
const intentOf = (
   signals: RankSignal[],
   model: RankModel,
   speed: number,
   now: Date,
   types: (type: SignalType) => boolean
) => {
   const best = new Map<SignalType, { points: number; days: number }>()

   for (const { type, at } of signals) {
      if (!types(type)) {
         continue
      }

      const weight = model.signals[type]
      const days = (now.getTime() - at.getTime()) / DAY_MS
      const points = weight.points * fadeFactor(days, weight.halfLifeDays * speed)
      const known = best.get(type)

      if (!known || points > known.points) {
         best.set(type, {
            points,
            days,
         })
      }
   }

   return [...best].map(([type, { points, days }]) => ({
      type,
      points,
      days,
   }))
}

const agoText = (days: number) => (days < 1 ? 'today' : days < 2 ? 'yesterday' : `${Math.floor(days)} days ago`)

export const rankPerson = (
   person: RankPerson,
   rules: IcpRules,
   model: RankModel,
   lines: TierLines,
   options: { speed?: number; never?: Never; now?: Date } = {}
): Ranked => {
   const {
      speed = 1,
      never = {
         titles: [],
         companies: [],
      },
      now = new Date(),
   } = options
   const empty = {
      fit: 0,
      intent: 0,
      reach: 0,
      relationship: 0,
   }
   const headline = `${person.headline ?? ''} ${person.title ?? ''}`

   if (person.signals.some(({ type }) => type === 'competitor')) {
      return excluded('competitor', empty)
   }

   const bannedTitle = never.titles.find(title => words(headline, title))

   if (bannedTitle) {
      return excluded('title', empty)
   }

   const company = person.company?.toLowerCase() ?? ''

   if (company !== '' && never.companies.some(name => name.toLowerCase() === company)) {
      return excluded('company', empty)
   }

   const icp = scoreIcp(rules, {
      headline: person.headline ?? person.title,
      location: person.location,
      companyIndustry: person.companyIndustry,
      companySize: person.companySize,
      read: person.read,
   })

   if (icp.disqualified) {
      return excluded('title', empty)
   }

   const max = fitMax(rules, person.read)
   const fit = max === 0 ? 0 : Math.round(model.parts.fit * Math.min(1, icp.score / max))
   const fresh = intentOf(person.signals, model, speed, now, type => !RELATIONSHIP.includes(type))
   const intent = Math.round(
      Math.min(
         model.parts.intent,
         fresh.reduce((sum, each) => sum + each.points, 0)
      )
   )
   const reach =
      person.followers === null ? 0 : Math.round(model.parts.reach * Math.min(1, Math.log10(person.followers + 1) / 4))
   const relationship = Math.round(
      Math.min(
         model.parts.relationship,
         intentOf(person.signals, model, speed, now, type => RELATIONSHIP.includes(type)).reduce(
            (sum, each) => sum + each.points,
            0
         )
      )
   )
   const total = Math.min(100, fit + intent + reach + relationship)
   // Tier A needs a profile read: a headline can match by luck.
   const score = person.read ? total : Math.min(total, lines.a - 1)

   return {
      excluded: null,
      score,
      tier: tierOf(score, lines),
      parts: {
         fit,
         intent,
         reach,
         relationship,
      },
      matched: [
         ...icp.matched,
         ...fresh
            .filter(each => each.points >= 1)
            .sort((a, b) => b.points - a.points)
            .map(each => `${SIGNAL_LABELS[each.type].toLowerCase()} ${agoText(each.days)}`),
         ...(person.read ? [] : ['profile not read yet, so not above tier B']),
      ],
   }
}

function excluded(rule: 'competitor' | 'title' | 'company', parts: Ranked['parts']): Ranked {
   return {
      excluded: `Excluded: ${rule}.`,
      score: 0,
      tier: 'D',
      parts,
      matched: [],
   }
}

export type RankCompany = {
   name: string | null
   industry: string | null
   size: string | null
   location: string | null
   specialities: string[]
   tagline: string | null
   signals: Array<{ type: CompanySignalType; at: Date }>
}

// A company: fit from its size, industry, place and the words of the problem, triggers from what it is doing now.
export const rankCompany = (
   company: RankCompany,
   rules: IcpRules & { problemKeywords: string[] },
   model: RankModel,
   lines: TierLines,
   options: { speed?: number; never?: Never; now?: Date } = {}
): Ranked & { unread: boolean } => {
   const {
      speed = 1,
      never = {
         titles: [],
         companies: [],
      },
      now = new Date(),
   } = options
   const name = company.name?.toLowerCase() ?? ''
   const empty = {
      fit: 0,
      intent: 0,
      reach: 0,
      relationship: 0,
   }

   if (name !== '' && never.companies.some(each => each.toLowerCase() === name)) {
      return {
         ...excluded('company', empty),
         unread: false,
      }
   }

   const text = [company.tagline ?? '', ...company.specialities].join(' ')
   const criteria: Array<[string, number, boolean, boolean]> = [
      [
         `size ${company.size ?? ''}`,
         30,
         (rules.companySizes ?? []).length > 0,
         (rules.companySizes ?? []).some(band => bandOf(band) === bandOf(company.size ?? '')),
      ],
      [
         `industry ${company.industry ?? ''}`,
         25,
         (rules.industries ?? []).length > 0,
         (rules.industries ?? []).some(each => company.industry !== null && words(company.industry, each)),
      ],
      [
         `place ${company.location ?? ''}`,
         15,
         (rules.locations ?? []).length > 0,
         (rules.locations ?? []).some(each => company.location !== null && words(company.location, each)),
      ],
      [
         'talks about the problem',
         30,
         rules.problemKeywords.length > 0,
         rules.problemKeywords.some(each => words(text, each)),
      ],
   ]
   const asked = criteria.filter(([, , wanted]) => wanted)
   const met = asked.filter(([, , , hit]) => hit)
   const askedWeight = asked.reduce((sum, [, weight]) => sum + weight, 0)
   const fitShare = model.parts.fit + model.parts.reach + model.parts.relationship
   const fit =
      askedWeight === 0 ? 0 : Math.round(fitShare * (met.reduce((sum, [, weight]) => sum + weight, 0) / askedWeight))
   const weights = COMPANY_SIGNAL_TYPES.reduce<Record<string, { points: number; halfLifeDays: number }>>(
      (all, type) => {
         all[type] = model.companySignals[type]

         return all
      },
      {}
   )
   const triggers = new Map<CompanySignalType, { points: number; days: number }>()

   for (const { type, at } of company.signals) {
      const weight = weights[type]
      const days = (now.getTime() - at.getTime()) / DAY_MS
      const points = weight ? weight.points * fadeFactor(days, weight.halfLifeDays * speed) : 0

      if (points > (triggers.get(type)?.points ?? 0)) {
         triggers.set(type, {
            points,
            days,
         })
      }
   }

   const intent = Math.round(
      Math.min(
         model.parts.intent,
         [...triggers.values()].reduce((sum, each) => sum + each.points, 0)
      )
   )
   const score = Math.min(100, fit + intent)

   return {
      excluded: null,
      score,
      tier: tierOf(score, lines),
      parts: {
         fit,
         intent,
         reach: 0,
         relationship: 0,
      },
      matched: [
         ...met.map(([label]) => label),
         ...[...triggers].filter(([, each]) => each.points >= 1).map(([type, each]) => `${type} ${agoText(each.days)}`),
      ],
      unread: company.industry === null && company.size === null,
   }
}

// The best few of each company, in score order. With `spread` it takes one of each role before a second of any role.
export const pickBestPer = <T>(
   items: T[],
   keyOf: (item: T) => string | null,
   scoreOf: (item: T) => number,
   roleOf: (item: T) => string | null,
   per: number,
   spread: boolean
) => {
   const kept = new Set<T>()
   const groups = new Map<string, T[]>()

   for (const item of items) {
      const key = keyOf(item)

      if (key === null) {
         kept.add(item)
      } else {
         groups.set(key, [...(groups.get(key) ?? []), item])
      }
   }

   for (const group of groups.values()) {
      const ordered = [...group].sort((a, b) => scoreOf(b) - scoreOf(a))
      const taken: T[] = []

      if (spread) {
         const roles = new Set<string>()

         for (const item of ordered) {
            const role = roleOf(item)

            if (role && !roles.has(role) && taken.length < per) {
               roles.add(role)
               taken.push(item)
            }
         }
      }

      for (const item of ordered) {
         if (taken.length < per && !taken.includes(item)) {
            taken.push(item)
         }
      }

      taken.forEach(item => kept.add(item))
   }

   return {
      kept: items.filter(item => kept.has(item)),
      rest: items.filter(item => !kept.has(item)),
   }
}

export type Colleagues = { lastContactAt: Date | null; lastReplyAt: Date | null }

// Whether one person of a company may go on now: not after a colleague replied, not soon after a colleague was contacted, and in one run
// only the best-scored person of the company.
export const spaceOutReason = (
   colleagues: Colleagues | undefined,
   options: { daysApart: number; stopAfterReply: boolean; forDays: number; now?: Date },
   best: boolean
) => {
   const now = (options.now ?? new Date()).getTime()
   const within = (at: Date | null, days: number) => at !== null && now - at.getTime() < days * DAY_MS

   if (options.stopAfterReply && within(colleagues?.lastReplyAt ?? null, options.forDays)) {
      return 'A colleague replied.'
   }

   if (within(colleagues?.lastContactAt ?? null, options.daysApart)) {
      return 'A colleague was contacted lately.'
   }

   return best ? null : 'Another colleague goes first.'
}
