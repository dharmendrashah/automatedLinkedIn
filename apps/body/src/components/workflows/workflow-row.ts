import type { WorkflowSummary } from './types'

import { isLive } from './run-sentence'

type LastRun = WorkflowSummary['runs'][number]

// Whether a workflow runs on its own (a schedule block, switched on or off) or only when someone starts it.
export const scheduleOf = (workflow: Pick<WorkflowSummary, 'graph' | 'enabled'>) =>
   workflow.graph.nodes.some(({ type }) => type === 'trigger.schedule') ? (workflow.enabled ? 'on' : 'off') : 'manual'

// The numbers of the last run for the columns. Null is "nothing to show": no run yet, a run still going, a failed run, or a run
// that scored nobody, so a column never shows a 0 that looks like a result.
export const metricsOf = (run: LastRun | undefined) => {
   if (!run) {
      return { found: null, qualified: null, maybe: null, cost: null, perQualified: null }
   }

   const found = run.qualified + run.maybe + run.discarded
   const scored = !isLive(run.status) && run.status !== 'FAILED' && found > 0

   return {
      found: scored ? found : null,
      qualified: scored ? run.qualified : null,
      maybe: scored ? run.maybe : null,
      cost: run.costMicros,
      perQualified: scored && run.qualified > 0 ? Math.round(run.costMicros / run.qualified) : null,
   }
}

// A workflow made by a campaign is named "<campaign> · 3 Warm up". Inside the campaign column the campaign name is already
// there, so the workflow shows only "3 Warm up". Any other name is left as it is.
export const shortName = (workflow: Pick<WorkflowSummary, 'name' | 'campaign'>) => {
   const prefix = workflow.campaign ? `${workflow.campaign.name} · ` : null
   const rest = prefix && workflow.name.startsWith(prefix) ? workflow.name.slice(prefix.length).trim() : ''

   return rest === '' ? { name: workflow.name, stageInName: false } : { name: rest, stageInName: true }
}
