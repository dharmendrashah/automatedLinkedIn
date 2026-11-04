import { type HandoffRow, daysSince, domainOfWebsite, handoffCsv } from 'core'

import { APP_URL } from 'env'

import { PersonDatesService } from './personDates.service'
import { PrismaService } from './prisma.service'

// What a run already knows of a person it wants in the hand-off file; My network fills in the rest.
export type HandoffInput = {
   slug: string
   name?: string | null
   title?: string | null
   company?: string | null
   domain?: string | null
   email?: string | null
   engagedWith?: string | null
   score?: number | null
}

const pick = <T>(first: T | null | undefined, second: T | null | undefined): T | null => first ?? second ?? null

// The hand-off file of people (.plan/lead-pipeline-p1-foundations.md): the dates come from My network and the invites, so a person
// no run read is still complete.
export class HandoffService {
   public static async csv(userId: string, wanted: HandoffInput[], now = new Date()) {
      const slugs = wanted.map(({ slug }) => slug)
      const db = PrismaService.client
      const [people, dates, firstMessages, profiles] = await Promise.all([
         db.person.findMany({
            where: {
               userId,
               slug: { in: slugs },
            },
            select: {
               slug: true,
               name: true,
               title: true,
               company: true,
               companySlug: true,
               score: true,
               reasonText: true,
               invitedAt: true,
               lastSentAt: true,
               waiting: true,
               inviteState: true,
            },
         }),
         PersonDatesService.forSlugs(userId, slugs),
         db.linkedInReply.groupBy({
            by: ['recipientSlug'],
            where: {
               userId,
               recipientSlug: { in: slugs },
               state: { in: ['SENT', 'UNKNOWN'] },
            },
            _min: { createdAt: true },
         }),
         db.linkedInProfile.findMany({
            where: {
               userId,
               slug: { in: slugs },
            },
            select: {
               slug: true,
               email: true,
            },
         }),
      ])
      const companies = await db.linkedInCompany.findMany({
         where: {
            userId,
            slug: { in: people.flatMap(({ companySlug }) => (companySlug ? [companySlug] : [])) },
         },
         select: {
            slug: true,
            website: true,
         },
      })
      const byPerson = new Map(people.map(person => [person.slug, person]))
      const firstBy = new Map(firstMessages.map(({ recipientSlug, _min }) => [recipientSlug, _min.createdAt]))
      const emailBy = new Map(profiles.map(({ slug, email }) => [slug, email]))
      const websiteBy = new Map(companies.map(({ slug, website }) => [slug, website]))
      const rows: HandoffRow[] = wanted.map(item => {
         const person = byPerson.get(item.slug)
         const when = dates.get(item.slug)
         const waitingSince =
            person?.inviteState === 'PENDING' ? person.invitedAt : person?.waiting ? person.lastSentAt : null

         return {
            slug: item.slug,
            name: pick(item.name, person?.name),
            title: pick(item.title, person?.title),
            company: pick(item.company, person?.company),
            domain: pick(item.domain, domainOfWebsite(websiteBy.get(person?.companySlug ?? ''))),
            email: pick(item.email, emailBy.get(item.slug)),
            invitedOn: when?.invited ?? null,
            acceptedOn: when?.accepted ?? null,
            firstMessageOn: firstBy.get(item.slug) ?? null,
            daysWaiting: daysSince(waitingSince, now),
            engagedWith: pick(item.engagedWith, person?.reasonText),
            score: pick(item.score, person?.score),
         }
      })

      return handoffCsv(APP_URL, rows)
   }
}
