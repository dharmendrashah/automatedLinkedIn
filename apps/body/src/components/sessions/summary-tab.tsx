import { SectionLabel } from '@/components/text-block'
import { Button } from '@/components/ui/button'
import { CheckCircle2, CircleHelp, Loader2, TriangleAlert, XCircle } from 'lucide-react'
import { type ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { type SessionDetail } from './types'

import { actionLabel, describeStep, formatDuration, hintFor, proxyLabel, resultOf, timeAgo } from './describe'
import { type Timeline, parseTimeline } from './recording'
import { Screenshot } from './steps-tab'
import { useSessionText } from './use-session-file'
import { useTaskCatalog } from './use-task-catalog'

const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
   <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
   </div>
)

const startedBy = {
   automatic: 'Automatically, after the proxy tested ok',
   manual: 'You',
   retry: 'You, running it again',
} as const

const bannerText = (session: SessionDetail) => {
   if (session.status === 'IN_PROGRESS') {
      return session.noAnswer
         ? 'The spider has not answered for a long time. It may be busy or switched off.'
         : 'The spider is working on this. The page updates by itself.'
   }

   return session.message ?? (session.status === 'SUCCEEDED' ? 'Signed in to LinkedIn.' : 'The check failed.')
}

const Banner = ({ session }: { session: SessionDetail }) => {
   const { tone } = resultOf(session, useTaskCatalog())
   const Icon = { success: CheckCircle2, failure: XCircle, running: Loader2, unknown: TriangleAlert, neutral: CircleHelp }[
      tone
   ]
   const hint = hintFor(session.message)

   return (
      <div
         className={cn(
            'flex gap-3 rounded-xl border p-4',
            tone === 'success' && 'border-success/30 bg-success/5',
            tone === 'failure' && 'border-destructive/30 bg-destructive/5',
            tone === 'unknown' && 'border-warning/30 bg-warning/5',
            tone === 'neutral' && 'bg-muted/40'
         )}
      >
         <Icon className={cn('mt-0.5 size-5 shrink-0', tone === 'running' && 'text-muted-foreground animate-spin')} />
         <div className="grid gap-1">
            <p className="text-sm font-medium">{bannerText(session)}</p>
            {hint ? <p className="text-muted-foreground text-sm">{hint}</p> : null}
         </div>
      </div>
   )
}

// The first step that failed, with the page as it looked then. It is what a fix to the spider starts from.
const WhereItWentWrong = ({ session }: { session: SessionDetail }) => {
   const file = useSessionText(session, 'timeline.json')
   const timeline: Timeline | null = file.text ? parseTimeline(file.text) : null
   const step = timeline?.steps.find(item => !item.ok)

   if (!step) {
      return null
   }

   return (
      <section className="grid gap-2">
         <SectionLabel>Where it went wrong</SectionLabel>
         <div className="grid gap-3 rounded-xl border p-4">
            <p className="text-sm font-medium">
               Step {step.n}: {describeStep(step)}
            </p>
            {step.error ? <p className="text-destructive font-mono text-xs break-words">{step.error}</p> : null}
            {step.screenshot ? <Screenshot session={session} name={step.screenshot} /> : null}
         </div>
      </section>
   )
}

type Props = {
   session: SessionDetail
   onOpen: (id: string) => void
}

export const SummaryTab = ({ session, onOpen }: Props) => {
   const catalog = useTaskCatalog()
   const { label } = resultOf(session, catalog)
   const recordingAvailable = session.recordingsConfigured && session.hasRecording && !session.recordingExpired

   return (
      <div className="grid gap-6">
         <Banner session={session} />

         {session.status === 'FAILED' && recordingAvailable ? <WhereItWentWrong session={session} /> : null}

         <section className="grid gap-3">
            <SectionLabel>What it was given</SectionLabel>
            <dl className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
               <Fact label="Action">{actionLabel(session, catalog)}</Fact>
               <Fact label="LinkedIn account">{session.linkedInAccount.email}</Fact>
               <Fact label="Proxy">
                  <span className="font-mono text-xs">{proxyLabel(session)}</span>
                  {session.proxyCountry ? <span className="text-muted-foreground"> · {session.proxyCountry}</span> : null}
               </Fact>
               <Fact label="Started">{new Date(session.startedAt).toLocaleString()}</Fact>
               {session.requestParams.action === 'TASK' ? (
                  <Fact label="Started by">{startedBy[session.requestParams.trigger]}</Fact>
               ) : (
                  <Fact label="Credentials">Sent sealed to the spider. They are never shown or recorded.</Fact>
               )}
            </dl>
         </section>

         <section className="grid gap-3">
            <SectionLabel>What came back</SectionLabel>
            <dl className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
               <Fact label="Result">{label}</Fact>
               <Fact label="Took">{formatDuration(session.durationMs)}</Fact>
               <Fact label="Message">{session.message ?? '—'}</Fact>
               <Fact label="Finished">{session.finishedAt ? new Date(session.finishedAt).toLocaleString() : '—'}</Fact>
            </dl>
         </section>

         {session.retryOfId || session.retries.length > 0 ? (
            <section className="grid gap-2">
               <SectionLabel>Related sessions</SectionLabel>
               <div className="flex flex-wrap gap-2">
                  {session.retryOfId ? (
                     <Button variant="outline" size="sm" onClick={() => onOpen(session.retryOfId as string)}>
                        Tried again from an earlier session
                     </Button>
                  ) : null}
                  {session.retries.map(retry => (
                     <Button key={retry.id} variant="outline" size="sm" onClick={() => onOpen(retry.id)}>
                        Tried again {timeAgo(new Date(retry.startedAt))}
                     </Button>
                  ))}
               </div>
            </section>
         ) : null}
      </div>
   )
}
