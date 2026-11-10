import { randomUUID } from 'node:crypto'

import { aiConfigured, aiPrice, callModel } from 'core/aiModel'
import { type IcpText, type Profile, blend, judgeFit } from 'core/aiScore'
import { readSeniorities } from 'core/icpScore'
import { personIcpScore } from 'core/personScore'

import { AiBudgetService } from './aiBudget.service'
import { ConflictError } from './conflict'
import { IcpService } from './icp.service'
import { IcpJudgementService } from './icpJudgement.service'
import { PersonService } from './person.service'
import { PersonSnapshotService } from './personSnapshot.service'
import { PrismaService } from './prisma.service'
import { readGraph } from './workflow.service'

// A score the owner asked for against one ideal customer (.plan/rescore-person.md). Separate from the list scores.
const DEFAULT_AI_WEIGHT = 30

export type RescoreResult =
   | { state: 'READING' }
   | {
        state: 'SCORED'
        score: number
        disqualified: boolean
        matched: string[]
        icpName: string
        judged: boolean
        scoredAt: Date
     }

type Person = {
   slug: string
   name: string | null
   headline: string | null
   title: string | null
   company: string | null
   companySlug: string | null
}

type Icp = NonNullable<Awaited<ReturnType<typeof IcpService.getForUser>>>

export class PersonScoreService {
   // Scores one of the owner's people against an ideal customer. A person whose profile is not read yet waits for the read.
   public static async rescore(userId: string, id: string, icpId: string): Promise<RescoreResult | null> {
      const person = await PrismaService.client.person.findFirst({
         where: {
            id,
            userId,
         },
         select: {
            slug: true,
            name: true,
            headline: true,
            title: true,
            company: true,
            companySlug: true,
            profileRead: true,
         },
      })

      if (!person) {
         return null
      }

      const icp = await IcpService.getForUser(userId, icpId)

      if (!icp) {
         throw new ConflictError('Pick an ideal customer you own.')
      }

      if (!person.profileRead) {
         await PersonService.readFull(userId, person.slug)
         await PrismaService.client.person.update({
            where: { id },
            data: { icpScoreWaitingFor: icpId },
         })

         return { state: 'READING' }
      }

      return {
         state: 'SCORED',
         ...(await PersonScoreService.scoreAndStore(userId, id, person, icp)),
      }
   }

   // The worker's pass: scores the people whose profile read came in after a rescore asked for it.
   public static async scoreWaiting(limit = 50): Promise<number> {
      const waiting = await PrismaService.client.person.findMany({
         where: {
            icpScoreWaitingFor: { not: null },
            profileRead: true,
         },
         select: {
            id: true,
            userId: true,
            icpScoreWaitingFor: true,
            slug: true,
            name: true,
            headline: true,
            title: true,
            company: true,
            companySlug: true,
         },
         take: limit,
      })
      let done = 0

      for (const person of waiting) {
         if (!person.icpScoreWaitingFor) {
            continue
         }

         const icp = await IcpService.getForUser(person.userId, person.icpScoreWaitingFor)

         if (!icp) {
            await PrismaService.client.person.update({
               where: { id: person.id },
               data: { icpScoreWaitingFor: null },
            })

            continue
         }

         await PersonScoreService.scoreAndStore(person.userId, person.id, person, icp)
         done += 1
      }

      return done
   }

   private static async scoreAndStore(userId: string, id: string, person: Person, icp: Icp) {
      const snapshot = (await PersonSnapshotService.forSlugs(userId, [person.slug])).get(person.slug) ?? null
      const company = person.companySlug
         ? await PrismaService.client.linkedInCompany.findFirst({
              where: {
                 userId,
                 slug: person.companySlug,
              },
              select: {
                 industry: true,
                 size: true,
              },
           })
         : null
      const signals = await PrismaService.client.personSignal.findMany({
         where: {
            userId,
            slug: person.slug,
         },
         select: {
            type: true,
            excerpt: true,
         },
      })
      const rule = personIcpScore(
         {
            ...icp,
            seniorities: readSeniorities(icp.seniorities),
         },
         {
            headline: snapshot?.headline ?? person.headline,
            title: person.title,
            location: snapshot?.location ?? null,
            companyIndustry: company?.industry ?? null,
            companySize: company?.size ?? null,
            read: snapshot !== null,
            signals,
         }
      )
      const weight = await PersonScoreService.aiWeightOf(userId, icp.id)
      const fit =
         weight === null || rule.disqualified || !aiConfigured()
            ? null
            : await PersonScoreService.fitOf(userId, icp, person, {
                 location: snapshot?.location ?? null,
                 headline: snapshot?.headline ?? person.headline,
                 companyIndustry: company?.industry ?? null,
                 companySize: company?.size ?? null,
                 excerpt: signals.find(({ excerpt }) => excerpt !== null)?.excerpt ?? null,
              })
      const score = fit === null || weight === null ? rule.score : blend(rule.score, fit, weight)
      const scoredAt = new Date()

      await PrismaService.client.person.update({
         where: { id },
         data: {
            icpScore: score,
            icpScoreReasons: {
               disqualified: rule.disqualified,
               matched: rule.matched,
            },
            icpScoreIcpId: icp.id,
            icpScoreIcpName: icp.name,
            icpScoredAt: scoredAt,
            icpScoreWaitingFor: null,
         },
      })

      return {
         score,
         disqualified: rule.disqualified,
         matched: rule.matched,
         icpName: icp.name,
         judged: fit !== null,
         scoredAt,
      }
   }

   // The AI weight of the Score block that scores against this ideal customer with AI judgement on; null when none does.
   private static async aiWeightOf(userId: string, icpId: string) {
      const workflows = await PrismaService.client.workflow.findMany({
         where: { userId },
         select: { graph: true },
      })

      for (const { graph } of workflows) {
         for (const node of readGraph(graph).nodes) {
            if (node.type === 'score.icp' && node.config.icpId === icpId && node.config.aiJudgement === true) {
               return typeof node.config.aiWeight === 'number' ? node.config.aiWeight : DEFAULT_AI_WEIGHT
            }
         }
      }

      return null
   }

   // The AI's fit for the person: a judgement kept within 30 days, or one call that is booked against the owner's budget.
   private static async fitOf(
      userId: string,
      icp: Icp,
      person: Person,
      facts: {
         location: string | null
         headline: string | null
         companyIndustry: string | null
         companySize: string | null
         excerpt: string | null
      }
   ) {
      const reused = await IcpJudgementService.recent(userId, icp.id, [person.slug])
      const cached = reused.get(person.slug)

      if (cached !== undefined) {
         return cached
      }

      if ((await AiBudgetService.room(userId)) !== 'OK') {
         return null
      }

      const profile: Profile = {
         name: person.name,
         headline: facts.headline,
         title: person.title,
         company: person.company,
         location: facts.location,
         companyIndustry: facts.companyIndustry,
         companySize: facts.companySize,
         excerpt: facts.excerpt,
      }
      const text: IcpText = {
         includeTitles: icp.includeTitles,
         excludeTitles: icp.excludeTitles,
         seniorities: icp.seniorities,
         industries: icp.industries,
         companySizes: icp.companySizes,
         locations: icp.locations,
         problemKeywords: icp.problemKeywords,
      }
      const answer = await judgeFit(profile, text, callModel, aiPrice())

      if (answer.status === 'FAILED') {
         return null
      }

      await AiBudgetService.record(userId, {
         id: randomUUID(),
         workflowId: null,
         runId: null,
         amountMicros: answer.usage.costMicros,
         label: 'AI judgement',
         preview: false,
      })
      await IcpJudgementService.save(userId, icp.id, person.slug, answer.fit)

      return answer.fit
   }
}
