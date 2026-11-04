import { randomUUID } from 'node:crypto'

import { type ItemFacts, type PersonItem, type WorkflowItemData, mergeBySlug } from 'core'
import { labelText } from 'core/aiLabeler'
import { aiConfigured, aiPrice, callModel } from 'core/aiModel'
import { PATTERN_MIN, PATTERN_PARTS, type PatternPart, findPattern, newRoleOf } from 'core/pattern'

import { AiBudgetService, PersonSnapshotService, SignalService, WorkflowRunService } from 'database'

import { labelsOf } from '@automatedLinkedIn/contracts'

import {
   type Context,
   type StepResult,
   aside,
   configOf,
   elseKey,
   keepItems,
   numberIn,
   peopleOf,
   textIn,
   wordsIn,
} from './context'

// "Label with AI", "Find the pattern" and "Detect changes" (.plan/lead-pipeline-p8-reading-blocks.md). They read and describe; none of them writes
// to anyone or acts on LinkedIn.

const PREVIEW_SAMPLES = 3

const dollars = (micros: number) => `$${(micros / 1_000_000).toFixed(3)}`

const textOf = (item: WorkflowItemData, read: string) => {
   const wanted = {
      post: read === 'auto' || read === 'post',
      profile: read === 'auto' || read === 'headline',
      conversation: read === 'auto' || read === 'message',
   }

   if (item.kind === 'post' && wanted.post) {
      return item.preview?.text ?? ''
   }

   if (item.kind === 'profile' && wanted.profile) {
      return item.headline ?? ''
   }

   return item.kind === 'conversation' && wanted.conversation ? (item.lastText ?? '') : ''
}

const keyOf = (item: WorkflowItemData) => `${item.kind}:${item.slug}`

const tagged = (item: WorkflowItemData, label: string, confidence: number, alsoTag: boolean): WorkflowItemData => {
   const facts: ItemFacts = {
      ...item.facts,
      'item.label': label,
      'item.labelConfidence': confidence,
   }

   return item.kind === 'profile' && alsoTag
      ? {
           ...item,
           facts,
           tags: [...new Set([...item.tags, `label:${label}`])],
        }
      : {
           ...item,
           facts,
        }
}

export const classifyItems = async (ctx: Context): Promise<StepResult> => {
   const { run } = ctx
   const config = configOf(ctx.node)
   const labels = labelsOf(wordsIn(config, 'labels'))
   const read = textIn(config, 'read')
   const minConfidence = numberIn(config, 'minConfidence')
   const alsoTag = config.alsoTag !== false
   const limit = Math.min(numberIn(config, 'atMost'), ctx.preview ? PREVIEW_SAMPLES : Infinity)
   const items = [...new Map(ctx.inputs.map(item => [keyOf(item), item])).values()]
   const set = !aiConfigured() ? 'AI is not set up.' : null
   const room = set ? null : await AiBudgetService.room(run.userId)
   const stopped = set ?? (room === 'PAUSED' ? 'Paused by the admin.' : room === 'LIMIT' ? 'AI limit reached.' : null)
   const labelled: WorkflowItemData[] = []
   const left = new Map<string, WorkflowItemData[]>()
   const counts = new Map<string, number>()
   let calls = 0
   let spent = 0

   const leave = (reason: string, item: WorkflowItemData) => left.set(reason, [...(left.get(reason) ?? []), item])

   for (const item of items) {
      const text = textOf(item, read).trim()

      if (text === '') {
         leave('Nothing to read.', item)
      } else if (stopped) {
         leave(stopped, item)
      } else if (calls >= limit || (ctx.preview && !(await AiBudgetService.previewRoom(run.userId)))) {
         leave('AI limit reached.', item)
      } else if ((await AiBudgetService.room(run.userId)) !== 'OK') {
         leave('AI limit reached.', item)
      } else {
         calls += 1

         const answered = await labelText(text, labels, minConfidence, callModel, aiPrice())

         if (answered.status === 'FAILED') {
            leave('AI did not answer.', item)

            continue
         }

         spent += answered.usage.costMicros
         await AiBudgetService.record(run.userId, {
            id: randomUUID(),
            workflowId: run.workflowId,
            runId: run.id,
            amountMicros: answered.usage.costMicros,
            label: 'AI labels',
            preview: ctx.preview,
         })

         if (answered.status === 'UNSURE') {
            leave('Not sure.', item)
         } else {
            counts.set(answered.label, (counts.get(answered.label) ?? 0) + 1)
            labelled.push(tagged(item, answered.label, answered.confidence, alsoTag))
         }
      }
   }

   const rest = [...left].flatMap(([reason, group]) => aside(group, 'classify', reason))

   await WorkflowRunService.replaceItems(elseKey(ctx, ctx.node.id), rest)

   const result = await keepItems(ctx, labelled, items.length)

   return {
      ...result,
      message: `${items.length} in, ${labelled.length} labelled${
         counts.size > 0 ? ` (${[...counts].map(([name, count]) => `${count} ${name}`).join(', ')})` : ''
      }, ${rest.length} to Else. AI cost ${dollars(spent)}.`,
   }
}

const PART_LABELS: Record<PatternPart, string> = {
   titles: 'Titles',
   companies: 'Companies',
   schools: 'Schools',
   skills: 'Skills',
   sizes: 'Company sizes',
   industries: 'Industries',
   places: 'Places',
}

const partsIn = (config: Record<string, unknown>) => {
   const chosen = PATTERN_PARTS.filter(part => wordsIn(config, 'parts').includes(part))

   return chosen.length > 0 ? chosen : PATTERN_PARTS
}

export const findThePattern = async (ctx: Context): Promise<StepResult> => {
   const people = mergeBySlug(peopleOf(ctx.inputs))
   const config = configOf(ctx.node)
   const snapshots = await PersonSnapshotService.forSlugs(
      ctx.run.userId,
      people.map(({ slug }) => slug)
   )
   const found = findPattern(
      people.map(item => ({
         snapshot: snapshots.get(item.slug) ?? null,
         companySize: item.companySize ?? null,
         companyIndustry: item.companyIndustry ?? null,
      })),
      partsIn(config),
      numberIn(config, 'top')
   )
   const result = await keepItems(ctx, ctx.inputs, ctx.inputs.length)
   const head = `${found.people} people, ${found.read} with a full profile.`

   return {
      ...result,
      message:
         found.read < PATTERN_MIN
            ? `${head} Too few to see a pattern. Read more profiles.`
            : [
                 head,
                 ...Object.entries(found.parts).flatMap(([part, counts]) =>
                    counts.length > 0
                       ? [
                            `${PART_LABELS[part as PatternPart]}: ${counts
                               .map(({ value, share }) => `${value} ${share}%`)
                               .join(', ')}.`,
                         ]
                       : []
                 ),
              ].join(' '),
   }
}

export const detectChanges = async (ctx: Context, now = new Date()): Promise<StepResult> => {
   const { userId } = ctx.run
   const people = mergeBySlug(peopleOf(ctx.inputs))
   const withinDays = numberIn(configOf(ctx.node), 'withinDays')
   const snapshots = await PersonSnapshotService.forSlugs(
      userId,
      people.map(({ slug }) => slug)
   )
   const changed: PersonItem[] = []
   const never: PersonItem[] = []
   const same: PersonItem[] = []
   const signals: Array<{ slug: string; since: string }> = []

   for (const item of people) {
      const snapshot = snapshots.get(item.slug)
      const change = snapshot ? newRoleOf(snapshot, withinDays, now) : null

      if (!snapshot) {
         never.push(item)
      } else if (!change) {
         same.push(item)
      } else {
         signals.push({
            slug: item.slug,
            since: change.since,
         })
         changed.push({
            ...item,
            facts: {
               ...item.facts,
               'change.kind': 'new_role',
               'change.role': change.role,
               'change.since': change.since,
            },
         })
      }
   }

   // The signal is dated the day the role started, so it fades from then and a second run adds nothing.
   if (!ctx.preview) {
      await SignalService.recordPeople(
         userId,
         signals.map(({ slug, since }) => ({
            slug,
            type: 'jobchange',
            via: since,
            at: new Date(`${since}T00:00:00Z`),
         }))
      )
   }

   await WorkflowRunService.replaceItems(elseKey(ctx, ctx.node.id), [
      ...aside(never, 'changes', 'Never read.'),
      ...aside(same, 'changes', 'No change.'),
   ])

   const result = await keepItems(ctx, changed, people.length)

   return {
      ...result,
      message: `${people.length} in, ${changed.length} with a new role, ${same.length} no change, ${never.length} never read.`,
   }
}
