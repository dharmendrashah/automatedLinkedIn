import { type TaskResult } from '@automatedLinkedIn/contracts'

export type RunRecord = {
   ok: boolean
   verdict: string
   durationMs: number
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`

// The tally printed after the runs: how many passed, which verdicts came up, and how long a run took.
export const summarise = (runs: RunRecord[]): string[] => {
   const verdicts = new Map<string, number>()

   runs.forEach(({ verdict }) => verdicts.set(verdict, (verdicts.get(verdict) ?? 0) + 1))

   const durations = runs.map(({ durationMs }) => durationMs)
   const average = durations.reduce((sum, value) => sum + value, 0) / durations.length

   return [
      `Runs: ${runs.length}, succeeded: ${runs.filter(({ ok }) => ok).length}`,
      `Verdicts: ${[...verdicts].map(([verdict, count]) => `${verdict} x${count}`).join(', ')}`,
      `Duration: shortest ${seconds(Math.min(...durations))}, average ${seconds(average)}, longest ${seconds(Math.max(...durations))}`,
   ]
}

// One run as console lines: the verdict in the task's own words, its message, and the report it returned.
export const formatRun = (result: TaskResult, verdictLabel: string): string[] => {
   const duration = Date.parse(result.finished_at) - Date.parse(result.started_at)
   const lines = [`${result.status} \u2014 ${verdictLabel} (${result.verdict}) in ${seconds(duration)}`, result.message]

   if (result.report) {
      // Tasks often use the same sentence for both.
      if (result.report.headline !== result.message) {
         lines.push(result.report.headline)
      }

      result.report.sections.forEach(section => {
         lines.push(`  ${section.title}`)
         section.items.forEach(item =>
            lines.push(`    ${item.label}: ${item.value}${item.status ? ` [${item.status}]` : ''}`)
         )
      })
   }

   return lines
}
