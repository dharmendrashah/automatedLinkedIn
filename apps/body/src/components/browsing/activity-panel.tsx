import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { type ReactNode, useMemo, useState } from 'react'

import { type AccountBrowse, type DaySession, type DayUsage } from './types'

import { BrowsingHeatmap } from './browsing-heatmap'
import { formatMinutes } from './format'
import { dayInZone, dayLabel } from './heatmap-grid'
import { limitSecondsOf } from './modes'
import { type SampleKind, dayOf } from './sample'
import { UseBar } from './use-bar'
import { useBrowseDay, useBrowseMix, useBrowseYear } from './use-browse-data'

type Props = {
   account: AccountBrowse
   // Null shows what brain serves; a kind shows invented data.
   kind: SampleKind | null
   now: Date
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
   <section className="grid gap-2 print:break-inside-avoid">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
   </section>
)

type DayProps = {
   usage: DayUsage | undefined
   sessions: { data: DaySession[] | undefined; loading: boolean; error: string | undefined }
}

const DaySessions = ({ usage, sessions }: DayProps) => {
   if (!usage) {
      return <p className="text-muted-foreground text-sm">Pick a day on the graph to see its sessions.</p>
   }

   if (usage.seconds === 0) {
      return <p className="text-muted-foreground text-sm">No browsing on this day.</p>
   }

   return (
      <div className="grid gap-1">
         <p className="text-sm font-medium">
            {dayLabel(usage.day)}: {formatMinutes(usage.seconds)} in {usage.sessions}{' '}
            {usage.sessions === 1 ? 'session' : 'sessions'}
         </p>
         {sessions.loading ? <Skeleton className="h-16 w-full" /> : null}
         {sessions.error ? <p className="text-destructive text-sm">{sessions.error}</p> : null}
         <ul className="divide-y rounded-md border text-sm empty:hidden">
            {sessions.data?.map(session => (
               <li key={session.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                  <span className="tabular-nums">{session.at}</span>
                  <span className="min-w-0 flex-1 truncate">{session.action}</span>
                  <span className="text-muted-foreground tabular-nums">{formatMinutes(session.seconds)}</span>
                  <span className="text-muted-foreground w-24 text-right">{session.result}</span>
               </li>
            ))}
         </ul>
      </div>
   )
}

// The year of one account's browsing as a graph, the sessions of a picked day and where today's time went. With a sample kind the
// numbers are invented and nothing is sent to brain.
export const ActivityPanel = ({ account, kind, now }: Props) => {
   const { accountId, hours, mode, usedSeconds } = account
   const today = kind ? dayOf(now) : dayInZone(now, hours.timeZone)
   const thisYear = Number(today.slice(0, 4))
   const [year, setYear] = useState<'recent' | number>('recent')
   const [selectedDay, setSelectedDay] = useState<string | null>(null)
   const yearDays = useBrowseYear(accountId, year === 'recent' ? undefined : year, kind, now)
   const days = useMemo(() => yearDays.data ?? [], [yearDays.data])
   const selected =
      days.find(item => item.day === selectedDay) ??
      (selectedDay ? { day: selectedDay, seconds: 0, sessions: 0, limitSeconds: limitSecondsOf(mode) } : undefined)
   const daySessions = useBrowseDay(accountId, selected, kind)
   const mix = useBrowseMix(accountId, usedSeconds, kind).data ?? []

   return (
      <div className="grid gap-5">
         <Section title="Activity">
            <Select
               value={String(year)}
               onValueChange={value => setYear(value === 'recent' ? 'recent' : Number(value))}
            >
               <SelectTrigger className="w-48" aria-label="Period">
                  <SelectValue />
               </SelectTrigger>
               <SelectContent>
                  <SelectItem value="recent">Last 12 months</SelectItem>
                  <SelectItem value={String(thisYear - 1)}>{thisYear - 1}</SelectItem>
               </SelectContent>
            </Select>
            {yearDays.loading ? <Skeleton className="h-40 w-full" /> : null}
            {yearDays.error ? <p className="text-destructive text-sm">{yearDays.error}</p> : null}
            {days.length > 0 ? (
               <>
                  <BrowsingHeatmap
                     days={days}
                     lastDay={year === 'recent' ? today : `${year}-12-31`}
                     hours={hours}
                     selectedDay={selectedDay}
                     onSelect={setSelectedDay}
                  />
                  <DaySessions usage={selected} sessions={daySessions} />
               </>
            ) : yearDays.loading || yearDays.error ? null : (
               <p className="text-muted-foreground rounded-md border border-dashed p-4 text-sm">
                  Nothing browsed yet. The graph fills in as this account's workflows and visits run.
               </p>
            )}
         </Section>

         {mix.length > 0 ? (
            <Section title="What used the time today">
               <ul className="grid gap-1 text-sm">
                  {mix.map(part => (
                     <li key={part.label} className="grid gap-1">
                        <span className="flex justify-between">
                           {part.label}
                           <span className="text-muted-foreground tabular-nums">{formatMinutes(part.seconds)}</span>
                        </span>
                        <UseBar usedSeconds={part.seconds} limitSeconds={usedSeconds} />
                     </li>
                  ))}
               </ul>
            </Section>
         ) : null}
      </div>
   )
}
