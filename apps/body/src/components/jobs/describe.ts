import type { Tone } from '@/lib/tone'

import type { Job, JobsOverview, RunDetail } from './types'

// What the cron monitor says in words (.plan/cron-monitor.md). Every state is a word and a tone, never a colour alone.

export const HEALTH: Record<Job['health'], { label: string; tone: Tone; hint: string }> = {
   HEALTHY: {
      label: 'On time',
      tone: 'success',
      hint: 'It ran when it should and the last run went well.',
   },
   LATE: {
      label: 'Late',
      tone: 'warning',
      hint: 'It has not finished a run when it should have. The worker may be stopped or the job stuck.',
   },
   FAILING: {
      label: 'Failing',
      tone: 'danger',
      hint: 'The last run failed or ran out of time.',
   },
   UNKNOWN: {
      label: 'No run yet',
      tone: 'neutral',
      hint: 'No run was recorded yet.',
   },
}

export const OUTCOME: Record<RunDetail['outcome'], { label: string; tone: Tone }> = {
   WORKED: {
      label: 'Did work',
      tone: 'success',
   },
   IDLE: {
      label: 'Nothing to do',
      tone: 'neutral',
   },
   FAILED: {
      label: 'Failed',
      tone: 'danger',
   },
   TIMED_OUT: {
      label: 'Timed out',
      tone: 'danger',
   },
}

export const ITEM_RESULT: Record<RunDetail['items'][number]['result'], { label: string; tone: Tone }> = {
   ASKED: {
      label: 'Asked for',
      tone: 'success',
   },
   SKIPPED: {
      label: 'Left',
      tone: 'neutral',
   },
   FAILED: {
      label: 'Failed',
      tone: 'danger',
   },
}

const ACTIONS: Record<string, string> = {
   'messages-read': 'Message read',
   visit: 'Daily visit',
   'sign-in-check': 'Sign-in check',
}

export const actionLabel = (action: string) => ACTIONS[action] ?? action

const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? '' : 's'}`

const spanText = (seconds: number) => {
   if (seconds < 60) {
      return plural(seconds, 'second')
   }

   const minutes = Math.round(seconds / 60)

   if (minutes < 60) {
      return plural(minutes, 'minute')
   }

   const hours = Math.round(minutes / 60)

   return hours < 48 ? plural(hours, 'hour') : plural(Math.round(hours / 24), 'day')
}

// "3 minutes ago", or "in 3 minutes" for a time that has not come.
export const whenText = (iso: string, now = Date.now()) => {
   const seconds = Math.round((now - Date.parse(iso)) / 1000)

   if (Math.abs(seconds) < 5) {
      return 'just now'
   }

   return seconds > 0 ? `${spanText(seconds)} ago` : `in ${spanText(-seconds)}`
}

export const workerBanner = (
   worker: JobsOverview['worker'],
   lastRunAt: string | null,
   now = Date.now()
): { tone: Tone; title: string } => {
   if (worker === 'UNKNOWN' || lastRunAt === null) {
      return {
         tone: 'neutral',
         title: 'No job has reported yet. The brain worker has not run since the monitor was added.',
      }
   }

   return worker === 'RUNNING'
      ? {
           tone: 'success',
           title: `The brain worker is running. A job last finished ${whenText(lastRunAt, now)}.`,
        }
      : {
           tone: 'danger',
           title: `No job has run on time. The last run finished ${whenText(lastRunAt, now)}. Check the brain worker.`,
        }
}

type Hour = Job['hours'][number]

export const hourState = (hour: Hour) => {
   if (hour.failed > 0) return 'failed' as const
   if (hour.worked > 0) return 'worked' as const
   if (hour.idle > 0) return 'idle' as const

   return 'none' as const
}

export const HOUR_TONE: Record<ReturnType<typeof hourState>, Tone> = {
   failed: 'danger',
   worked: 'success',
   idle: 'neutral',
   none: 'warning',
}

export const hourTitle = (hour: Hour, schedule: string) => {
   const start = new Date(hour.at)
   const label = start.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
   })

   return hourState(hour) === 'none'
      ? `${label}: no run recorded (the job runs ${schedule})`
      : `${label}: ${hour.worked} did work, ${hour.idle} nothing to do, ${hour.failed} failed`
}

const COUNT_LABELS: Record<string, string> = {
   accountsDue: 'accounts due',
   timesDrawn: 'first times drawn',
   itemsNotKept: 'accounts not listed',
}

const words = (key: string) => COUNT_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').toLowerCase()

export const countsText = (counts: Record<string, number>) =>
   Object.entries(counts)
      .map(([key, value]) => `${value} ${words(key)}`)
      .join(' · ')

// "Message read: 5 asked for, 2 left" for each action of a run, so the answer to "for how many accounts" is one line.
export const summariseItems = (items: RunDetail['items']) => {
   const byAction = new Map<string, { asked: number; left: number; failed: number }>()

   for (const { action, result } of items) {
      const line = byAction.get(action) ?? {
         asked: 0,
         left: 0,
         failed: 0,
      }

      if (result === 'ASKED') line.asked += 1
      else if (result === 'SKIPPED') line.left += 1
      else line.failed += 1

      byAction.set(action, line)
   }

   return [...byAction].map(([action, { asked, left, failed }]) => ({
      action,
      label: actionLabel(action),
      text: [`${asked} asked for`, `${left} left`, failed > 0 ? `${failed} failed` : null].filter(Boolean).join(', '),
   }))
}

export const STORED: Record<string, string> = {
   PENDING: 'waiting to be stored',
   DONE: 'stored',
   FAILED: 'could not be stored',
}

export const READ_STATE: Record<string, { label: string; tone: Tone }> = {
   ON_TIME: {
      label: 'On time',
      tone: 'success',
   },
   OVERDUE: {
      label: 'Overdue',
      tone: 'danger',
   },
   WAITING: {
      label: 'First time not drawn yet',
      tone: 'neutral',
   },
   NOT_SCHEDULED: {
      label: 'Not scheduled',
      tone: 'neutral',
   },
}

export const gapText = (minutes: number | null) => {
   if (minutes === null) {
      return '—'
   }

   return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}
