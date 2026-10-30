import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { tone } from '@/lib/tone'
import { History } from 'lucide-react'

import { cn } from '@/lib/utils'

import { type Job } from './types'

import { HEALTH, HOUR_TONE, OUTCOME, hourState, hourTitle, whenText } from './describe'
import { ToneBadge } from './tone-badge'

type Props = {
   job: Job
   now: number
   onOpen: () => void
}

// One job: what it is for, whether it is on time, what its last run did, and its last 24 hours hour by hour.
export const JobCard = ({ job, now, onOpen }: Props) => {
   const health = HEALTH[job.health]
   const { latest } = job

   return (
      <Card className="py-0">
         <CardContent className="grid gap-3 p-4">
            <div className="flex items-start justify-between gap-3">
               <div className="grid min-w-0 gap-1">
                  <h3 className="text-sm font-medium">{job.title}</h3>
                  <p className="text-muted-foreground text-xs">{job.purpose}</p>
               </div>
               <span title={health.hint}>
                  <ToneBadge tone={health.tone}>
                     {health.label}
                     {job.failureStreak > 1 ? ` · ${job.failureStreak} in a row` : ''}
                  </ToneBadge>
               </span>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
               <dt className="text-muted-foreground">Runs</dt>
               <dd>{job.schedule}</dd>
               <dt className="text-muted-foreground">Last run</dt>
               <dd>{latest ? whenText(latest.startedAt, now) : '—'}</dd>
               <dt className="text-muted-foreground">Next expected</dt>
               <dd>{job.nextExpectedAt ? whenText(job.nextExpectedAt, now) : '—'}</dd>
               <dt className="text-muted-foreground">Last 24 hours</dt>
               <dd>
                  {job.last24h.runs.toLocaleString()} runs, {job.last24h.worked.toLocaleString()} did work,{' '}
                  {job.last24h.failed.toLocaleString()} failed
               </dd>
            </dl>

            {latest ? (
               <div className="grid gap-1 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                     <ToneBadge tone={OUTCOME[latest.outcome].tone}>{OUTCOME[latest.outcome].label}</ToneBadge>
                     <span className="text-muted-foreground">{latest.summary}</span>
                  </div>
                  {latest.error ? <p className="text-destructive break-words">{latest.error}</p> : null}
               </div>
            ) : null}

            <div
               className="flex gap-0.5"
               role="img"
               aria-label={`The last 24 hours of ${job.title}, one cell an hour, oldest first`}
            >
               {job.hours.map(hour => (
                  <span
                     key={hour.at}
                     title={hourTitle(hour, job.schedule)}
                     className={cn('h-4 flex-1 rounded-sm', tone[HOUR_TONE[hourState(hour)]].solid)}
                  />
               ))}
            </div>
            <p className="text-muted-foreground -mt-1 text-[11px]">
               Green did work, grey nothing to do, red failed, amber no run recorded.
            </p>

            <Button variant="outline" size="sm" className="justify-self-start" onClick={onOpen}>
               <History />
               Runs
            </Button>
         </CardContent>
      </Card>
   )
}
