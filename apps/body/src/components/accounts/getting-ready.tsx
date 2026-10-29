import { CircleCheck } from 'lucide-react'

import { cn } from '@/lib/utils'

import { type AccountStatus } from './types'

import { type Loading, type Tone, readyLine, toneOf } from './loading'

const TONES: Record<Tone, string> = {
   RED: 'bg-red-300',
   GREY: 'bg-zinc-300',
   YELLOW: 'bg-yellow-300',
   BLUE: 'bg-blue-400',
   GREEN: 'bg-green-500',
}

const STEP_NAMES: Record<Loading['steps'][number]['step'], string> = {
   SIGN_IN: 'Sign-in',
   PROFILE: 'Your profile',
   CONNECTIONS: 'Connections',
   REQUESTS: 'Connection requests',
   MESSAGES: 'Messages',
}

const STATE_WORDS: Record<Loading['steps'][number]['state'], string> = {
   DONE: 'Done',
   READING: 'Reading now',
   WAITING: 'To come',
   NOT_FINISHED: 'Did not finish, tried again tomorrow',
   GIVEN_UP: 'Press Read profile',
}

type Props = {
   loading: Loading
   status: AccountStatus
   // The drawer shows each step and what the reads do; the list row only the bar and one line.
   full?: boolean
}

// "Getting your LinkedIn ready": the bar, one line of what happens, and what the account can be used for already.
export const GettingReady = ({ loading, status, full = false }: Props) => {
   if (loading.percent >= 100 && !full) {
      return (
         <span className="text-success inline-flex items-center gap-1 text-xs">
            <CircleCheck className="size-3.5" aria-hidden />
            Ready
         </span>
      )
   }

   const healthy = status === 'ACTIVE' || status === 'PENDING'

   return (
      <div className="grid gap-1.5">
         <div className="flex items-center gap-2">
            <div
               role="progressbar"
               aria-label="Getting your LinkedIn ready"
               aria-valuemin={0}
               aria-valuemax={100}
               aria-valuenow={loading.percent}
               className="bg-muted h-2 w-full max-w-48 overflow-hidden rounded-full border"
            >
               <div
                  className={cn(
                     'h-full rounded-full transition-[width]',
                     healthy ? TONES[toneOf(loading.percent)] : 'bg-zinc-300'
                  )}
                  style={{ width: `${loading.percent}%` }}
               />
            </div>
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
               {loading.percent >= 100 ? 'Ready' : `Getting ready ${loading.percent} %`}
            </span>
         </div>
         <p className="text-muted-foreground text-xs">{readyLine(loading, status)}</p>
         {loading.readyForWorkflows || loading.readyForUnibox ? (
            <p className="text-success flex flex-wrap gap-x-3 text-xs">
               {loading.readyForWorkflows ? <span>Ready for workflows</span> : null}
               {loading.readyForUnibox ? <span>Ready for the Unibox</span> : null}
            </p>
         ) : null}
         {full ? (
            <>
               <ul className="grid gap-1 text-sm">
                  {loading.steps.map(({ step, weight, state }) => (
                     <li key={step} className="flex items-center justify-between gap-2">
                        <span>
                           {STEP_NAMES[step]} <span className="text-muted-foreground text-xs">({weight} %)</span>
                        </span>
                        <span className={cn('text-xs', state === 'DONE' ? 'text-success' : 'text-muted-foreground')}>
                           {STATE_WORDS[state]}
                        </span>
                     </li>
                  ))}
               </ul>
               <p className="text-muted-foreground text-xs">
                  We only read. Nothing is posted, sent or accepted. It uses the account's browsing time, no credits.
               </p>
            </>
         ) : null}
      </div>
   )
}
