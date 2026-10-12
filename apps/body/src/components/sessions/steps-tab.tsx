import { Skeleton } from '@/components/ui/skeleton'
import { CheckCircle2, XCircle } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

import { type SessionDetail } from './types'

import { describeStep } from './describe'
import { Notice } from './recording-gate'
import { type TimelineStep, parseTimeline } from './recording'
import { useSessionLink, useSessionText } from './use-session-file'

export const Screenshot = ({
   sessionId,
   name,
   alt = 'The page after this step',
}: {
   sessionId: string
   name: string
   alt?: string
}) => {
   const link = useSessionLink(sessionId, `screenshots/${name}`)

   if (link.isPending) {
      return <Skeleton className="h-40 w-full rounded-lg" />
   }

   if (link.error) {
      return <p className="text-muted-foreground text-xs">The screenshot is not available.</p>
   }

   return (
      <img
         src={link.data.url}
         alt={alt}
         loading="lazy"
         className="w-full rounded-lg border"
      />
   )
}

const Fact = ({ label, children }: { label: string; children: string }) => (
   <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-mono text-xs break-all">{children}</dd>
   </div>
)

const StepCard = ({ sessionId, step }: { sessionId: string; step: TimelineStep }) => {
   // A failed step opens by itself: it is the one being looked for.
   const [open, setOpen] = useState(!step.ok)

   return (
      <li className={cn('rounded-xl border', !step.ok && 'border-destructive/40')}>
         <button
            type="button"
            onClick={() => setOpen(current => !current)}
            aria-expanded={open}
            className="flex w-full items-center gap-3 px-4 py-3 text-left"
         >
            {step.ok ? (
               <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
            ) : (
               <XCircle className="text-destructive size-4 shrink-0" />
            )}
            <span className="min-w-0 flex-1 text-sm break-words">
               <span className="text-muted-foreground mr-2 tabular-nums">{step.n}</span>
               {describeStep(step)}
            </span>
            <span className="text-muted-foreground text-xs tabular-nums">{step.durationMs} ms</span>
         </button>

         {open ? (
            <div className="grid gap-3 border-t px-4 py-3">
               {step.error ? <p className="text-destructive font-mono text-xs break-words">{step.error}</p> : null}
               {step.screenshot ? <Screenshot sessionId={sessionId} name={step.screenshot} /> : null}
               <dl className="grid gap-2 sm:grid-cols-2">
                  {step.selector ? <Fact label="Element">{step.selector}</Fact> : null}
                  {step.target ? <Fact label="Asked for">{step.target}</Fact> : null}
                  {step.urlBefore ? <Fact label="Page before">{step.urlBefore}</Fact> : null}
                  {step.urlAfter ? <Fact label="Page after">{step.urlAfter}</Fact> : null}
               </dl>
            </div>
         ) : null}
      </li>
   )
}

export const StepsTab = ({ session }: { session: SessionDetail }) => {
   const file = useSessionText(session.id, 'timeline.json')

   if (file.loading) {
      return <Skeleton className="h-40 w-full rounded-xl" />
   }

   if (file.error) {
      return <Notice>{file.error}</Notice>
   }

   const timeline = file.text ? parseTimeline(file.text) : null

   if (!timeline) {
      return <Notice>The steps of this session could not be read.</Notice>
   }

   return (
      <div className="grid gap-3">
         {timeline.notes.map(note => (
            <p key={note} className="text-muted-foreground text-xs">
               {note}
            </p>
         ))}
         {timeline.steps.length === 0 ? (
            <Notice>The spider did nothing in the browser before this ended.</Notice>
         ) : (
            <ol className="grid gap-2" aria-label="Steps">
               {timeline.steps.map(step => (
                  <StepCard key={step.n} sessionId={session.id} step={step} />
               ))}
            </ol>
         )}
      </div>
   )
}
