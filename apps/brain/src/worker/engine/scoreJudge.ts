import { randomUUID } from 'node:crypto'

import { type PersonItem } from 'core'
import { aiConfigured, aiPrice, callModel } from 'core/aiModel'
import { type IcpText, type Profile, blend, judgeFit } from 'core/aiScore'

import { AiBudgetService, IcpJudgementService, floorMicros } from 'database'

import { type ScoringRules, type Thresholds, bandOf } from './steps'

// Judges the people the rules kept with the AI and blends its fit into their score (.plan/score-icp-ai-judgement.md). A person the AI
// cannot judge keeps the rule score; the AI never rescues a person the rules dropped.

export type JudgeRun = {
   userId: string
   workflowId: string
   runId: string
   preview: boolean
   icpId: string
   balanceMicros: () => Promise<number>
}

const profileOf = (item: PersonItem): Profile => ({
   name: item.name,
   headline: item.headline,
   title: item.title,
   company: item.company,
   location: item.location,
   companyIndustry: item.companyIndustry ?? null,
   companySize: item.companySize ?? null,
   excerpt: item.signals.find(({ excerpt }) => excerpt !== null)?.excerpt ?? null,
})

const icpOf = (rules: ScoringRules): IcpText => ({
   includeTitles: rules.includeTitles,
   excludeTitles: rules.excludeTitles,
   seniorities: rules.seniorities.map(String),
   industries: rules.industries ?? [],
   companySizes: rules.companySizes ?? [],
   locations: rules.locations,
   problemKeywords: rules.problemKeywords,
})

// Why the AI may not be asked for this person now, or null when it may.
const refusalOf = async (run: JudgeRun) => {
   if (run.preview && !(await AiBudgetService.previewRoom(run.userId))) {
      return 'AI limit reached.'
   }

   if ((await run.balanceMicros()) < floorMicros()) {
      return 'Stopped because the data wallet ran low.'
   }

   const room = await AiBudgetService.room(run.userId)

   return room === 'OK' ? null : room === 'PAUSED' ? 'Paused by the admin.' : 'AI limit reached.'
}

export const judgeKept = async (
   run: JudgeRun,
   kept: PersonItem[],
   rules: ScoringRules,
   thresholds: Thresholds,
   weight: number
) => {
   const icp = icpOf(rules)
   const reused = await IcpJudgementService.recent(
      run.userId,
      run.icpId,
      kept.map(({ slug }) => slug)
   )
   const blended = (item: PersonItem, fit: number): PersonItem => {
      const score = blend(item.score ?? 0, fit, weight)

      return {
         ...item,
         score,
         band: bandOf(score, thresholds),
      }
   }
   let halt: string | null = aiConfigured() ? null : 'AI is not set up.'
   let judged = 0
   let fromCache = 0
   let ruled = 0
   const scored: PersonItem[] = []

   for (const item of kept) {
      const cached = reused.get(item.slug)

      if (cached !== undefined) {
         fromCache += 1
         scored.push(blended(item, cached))

         continue
      }

      halt ??= await refusalOf(run)

      if (halt) {
         ruled += 1
         scored.push(item)

         continue
      }

      const answer = await judgeFit(profileOf(item), icp, callModel, aiPrice())

      if (answer.status === 'FAILED') {
         ruled += 1
         scored.push(item)

         continue
      }

      await AiBudgetService.record(run.userId, {
         id: randomUUID(),
         workflowId: run.workflowId,
         runId: run.runId,
         amountMicros: answer.usage.costMicros,
         label: 'AI judgement',
         preview: run.preview,
      })
      await IcpJudgementService.save(run.userId, run.icpId, item.slug, answer.fit)
      judged += 1
      scored.push(blended(item, answer.fit))
   }

   const note = [`AI judgement: ${judged} judged, ${fromCache} reused, ${ruled} kept the rule score.`, halt]
      .filter(Boolean)
      .join(' ')

   return {
      kept: scored.filter(({ band }) => band !== null),
      note: kept.length > 0 ? note : null,
   }
}
