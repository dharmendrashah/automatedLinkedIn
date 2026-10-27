import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { type ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { type AccountBrowse } from '../browsing/types'

import { ClientField } from '../browsing/client-field'
import { formatMinutes, hoursText, meterText } from '../browsing/format'
import { HoursEditor } from '../browsing/hours-editor'
import { ModeCards } from '../browsing/mode-cards'
import { limitSecondsOf, modeOf } from '../browsing/modes'
import { type SampleKind } from '../browsing/sample'
import { useAccountEdits } from '../browsing/use-account-edits'
import { UseBar } from '../browsing/use-bar'

type PartProps = {
   value: string
   title: string
   // One line shown while the section is closed.
   summary?: string | undefined
   danger?: boolean
   children: ReactNode
}

// One section of the drawer: a title, a one-line summary while it is closed, and its content.
export const Part = ({ value, title, summary, danger = false, children }: PartProps) => (
   <AccordionItem
      value={value}
      className={cn(danger && 'border-destructive/40 bg-destructive/5 mt-4 rounded-lg border px-3')}
   >
      <AccordionTrigger className="group/trigger">
         <span className="grid gap-0.5">
            <span className={cn(danger && 'text-destructive')}>{title}</span>
            {summary ? (
               <span className="text-muted-foreground text-xs font-normal group-data-[state=open]/trigger:hidden">
                  {summary}
               </span>
            ) : null}
         </span>
      </AccordionTrigger>
      <AccordionContent>{children}</AccordionContent>
   </AccordionItem>
)

type Props = {
   browse: AccountBrowse | undefined
   loading: boolean
   error: string | undefined
   sample: SampleKind | null
   onActivity: () => void
   onDirtyChange: (dirty: boolean) => void
}

const Missing = ({ loading, error }: { loading: boolean; error: string | undefined }) =>
   loading ? (
      <Skeleton className="h-16 w-full" />
   ) : (
      <p className="text-muted-foreground text-sm">{error ?? 'No browsing data yet.'}</p>
   )

const Loaded = ({
   browse,
   sample,
   onActivity,
   onDirtyChange,
}: Omit<Props, 'browse' | 'loading' | 'error'> & { browse: AccountBrowse }) => {
   const edits = useAccountEdits(browse, sample)
   const limitSeconds = limitSecondsOf(browse.mode)

   return (
      <>
         <Part value="today" title="Browsing today" summary={`${meterText(browse.usedSeconds, limitSeconds)}`}>
            <div className="grid gap-2">
               <p className="text-2xl font-semibold tabular-nums">
                  {meterText(browse.usedSeconds, limitSeconds)}
                  <span className="text-muted-foreground ml-2 text-sm font-normal">
                     {formatMinutes(Math.max(0, limitSeconds - browse.usedSeconds))} left
                  </span>
               </p>
               <UseBar usedSeconds={browse.usedSeconds} limitSeconds={limitSeconds} className="h-1.5" />
               {browse.viewsLeft !== null && browse.viewsLeft > 0 ? (
                  <p className="text-muted-foreground text-sm">
                     About {browse.viewsLeft} profile views fit in what is left today.
                  </p>
               ) : null}
               <Button variant="outline" size="sm" className="w-fit" onClick={onActivity}>
                  Open activity
               </Button>
            </div>
         </Part>
         <Part
            value="limit"
            title="Daily limit"
            summary={`${modeOf(browse.mode).label}, ${modeOf(browse.mode).minutes} min a day`}
         >
            <ModeCards mode={browse.mode} onChange={edits.setMode} />
         </Part>
         <Part value="hours" title="Working hours" summary={hoursText(browse.hours)}>
            <HoursEditor
               key={JSON.stringify(browse.hours)}
               mode={browse.mode}
               hours={browse.hours}
               proxyTimeZone={browse.proxyTimeZone}
               onSave={edits.setHours}
               onDirtyChange={onDirtyChange}
            />
         </Part>
         <Part value="client" title="Client" summary={browse.clientLabel ?? 'No client'}>
            <ClientField key={browse.clientLabel ?? ''} account={browse} onChange={edits.setClient} />
         </Part>
      </>
   )
}

// The sections that come from the account's browsing data: today, the daily limit, the working hours and the client.
export const BrowsingParts = ({ browse, loading, error, ...rest }: Props) =>
   browse ? (
      <Loaded browse={browse} {...rest} />
   ) : (
      <>
         <Part value="today" title="Browsing today">
            <Missing loading={loading} error={error} />
         </Part>
         <Part value="limit" title="Daily limit">
            <Missing loading={loading} error={error} />
         </Part>
         <Part value="hours" title="Working hours">
            <Missing loading={loading} error={error} />
         </Part>
         <Part value="client" title="Client">
            <Missing loading={loading} error={error} />
         </Part>
      </>
   )
