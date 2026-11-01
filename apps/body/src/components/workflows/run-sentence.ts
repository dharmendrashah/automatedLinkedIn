import { formatUsd, whenText } from './types'

// One plain sentence for where a run stands, for the Runs tab, the canvas and the workflows list. Counts and money
// only; it never names the data supplier.

type Progress = {
   requests: number
   done: number
   failed: number
   uncharged: number
   retrying: number
   nextRetryAt: string | null
}

type Step = {
   type: string
   status: 'WAITING' | 'RUNNING' | 'DONE' | 'PARTIAL' | 'FAILED'
   message: string | null
   itemsOut: number
   progress: Progress | null
   // When a step held by a Wait goes on.
   waitUntil?: string | null
}

type Run = {
   status: 'RUNNING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'STOPPED'
   stopRequestedAt: string | null
   costMicros: number
   estimateMicros: number
   qualified: number
   maybe: number
   discarded: number
   message: string | null
   steps: Step[]
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

const peopleCount = (count: number) => (count === 1 ? '1 person' : `${count} people`)

const sum = (steps: Step[], key: keyof Omit<Progress, 'nextRetryAt'>) =>
   steps.reduce((total, step) => total + (step.progress?.[key] ?? 0), 0)

// "10:15" today, "Mon 09:00" on another day.
export const timeOf = (value: string, now: Date = new Date()) => {
   const at = new Date(value)
   const time = at.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
   })

   return at.toDateString() === now.toDateString() ? time : `${at.toLocaleDateString([], { weekday: 'short' })} ${time}`
}

const nextRetry = (steps: Step[]) =>
   steps
      .map(step => step.progress?.nextRetryAt)
      .filter((at): at is string => Boolean(at))
      .sort()[0]

const live = (run: Run, labelOf: (type: string) => string, now: Date) => {
   const requests = sum(run.steps, 'requests')
   const done = sum(run.steps, 'done')
   const retrying = sum(run.steps, 'retrying')
   const retryAt = nextRetry(run.steps)

   if (run.stopRequestedAt) {
      const finishing = requests - done - retrying

      return finishing > 0
         ? `Stopping: finishing ${plural(finishing, 'request')} already paid for. What they find is kept.`
         : 'Stopping: the last steps are wrapping up. Nothing new is paid for.'
   }

   const working = run.steps.filter(({ status }) => status === 'RUNNING').map(({ type }) => labelOf(type))
   const spent = `About ${formatUsd(run.costMicros)} spent of up to ${formatUsd(run.estimateMicros)}.`
   const retry =
      retrying > 0 && retryAt
         ? `Waiting to retry ${plural(retrying, 'request')} at ${timeOf(retryAt, now)} (retries are not charged unless they answer).`
         : ''

   if (working.length === 0 && retry) {
      return `${retry} ${spent}`
   }

   const [heldUntil] = run.steps
      .map(step => whenText(step.waitUntil ?? null, now))
      .filter((when): when is string => when !== null)
      .sort()

   if (working.length === 0 && heldUntil) {
      return `Waiting until ${heldUntil}. ${spent}`
   }

   const progress = requests > 0 ? `, ${done} of ${plural(requests, 'request')} done` : ''

   return [`Running: ${working.join(', ') || 'starting'}${progress}.`, retry, spent].filter(Boolean).join(' ')
}

export const runSentence = (run: Run, labelOf: (type: string) => string, now: Date = new Date()) => {
   if (run.status === 'RUNNING') {
      return live(run, labelOf, now)
   }

   if (run.status === 'STOPPED') {
      return `Stopped by you: ${run.qualified} qualified for ${formatUsd(run.costMicros)}.`
   }

   if (run.status === 'FAILED') {
      return `Failed: ${run.message ?? 'something went wrong. The platform owner has been told.'}`
   }

   if (run.status === 'PARTIAL') {
      const unanswered = sum(run.steps, 'uncharged')
      const note = run.message ?? run.steps.find(({ status, message }) => status === 'PARTIAL' && message)?.message

      return unanswered > 0
         ? `Done with gaps: ${plural(unanswered, 'request')} never answered (not charged). What was found is kept.`
         : `Done with gaps: ${note ?? 'some requests never answered. What was found is kept.'}`
   }

   const people = run.qualified + run.maybe + run.discarded
   const listed = run.steps
      .filter(({ type }) => type === 'output.list')
      .reduce((total, { itemsOut }) => total + itemsOut, 0)

   // Nothing was scored: say who reached the list instead of "0 qualified".
   if (people === 0 && listed > 0) {
      const each = formatUsd(Math.round(run.costMicros / listed))

      return `Done: ${peopleCount(listed)} added to the list for ${formatUsd(run.costMicros)}, ${each} a person.`
   }

   const share = people > 0 ? ` from ${peopleCount(people)} (${Math.round((run.qualified / people) * 100)}%)` : ''
   const each =
      run.qualified > 0 ? `, ${formatUsd(Math.round(run.costMicros / run.qualified))} per qualified person` : ''

   return `Done: ${run.qualified} qualified and ${run.maybe} maybe${share} for ${formatUsd(run.costMicros)}${each}.`
}
