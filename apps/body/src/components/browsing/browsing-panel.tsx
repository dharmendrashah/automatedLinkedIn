import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Printer } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { type AccountBrowse, type DaySession, type DayUsage, type WorkingHours } from './types'

import { BrowsingHeatmap } from './browsing-heatmap'
import { formatMinutes, hoursProblem, meterText, stateText } from './format'
import { dayInZone, dayLabel } from './heatmap-grid'
import { HoursEditor } from './hours-editor'
import { ModeCards } from './mode-cards'
import { limitSecondsOf, modeOf } from './modes'
import { type SampleKind, dayOf } from './sample'
import { UseBar } from './use-bar'
import { useBrowseChange } from './use-browse'
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

// Everything about one account's browsing time, once. It is shown in the drawer beside the table and inline on the account's own
// page. With a sample kind the numbers are invented, and nothing is sent to brain.
export const BrowsingPanel = ({ account, kind, now }: Props) => {
   const { accountId, email, mode, hours, usedSeconds } = account
   const change = useBrowseChange(kind !== null)
   const today = kind ? dayOf(now) : dayInZone(now, hours.timeZone)
   const thisYear = Number(today.slice(0, 4))
   const [year, setYear] = useState<'recent' | number>('recent')
   const [selectedDay, setSelectedDay] = useState<string | null>(null)
   const yearDays = useBrowseYear(accountId, year === 'recent' ? undefined : year, kind, now)
   const days = useMemo(() => yearDays.data ?? [], [yearDays.data])
   const limitSeconds = limitSecondsOf(mode)
   const selected =
      days.find(item => item.day === selectedDay) ??
      (selectedDay ? { day: selectedDay, seconds: 0, sessions: 0, limitSeconds } : undefined)
   const daySessions = useBrowseDay(accountId, selected, kind)
   const mix = useBrowseMix(accountId, usedSeconds, kind).data ?? []
   const hasAnyDay = days.length > 0

   const setMode = (next: typeof mode) => {
      const problem = hoursProblem(next, hours)

      if (problem) {
         toast.error(`${modeOf(next).label} is not possible with these hours. ${problem}`)

         return
      }

      change([account], { mode: next }, `${modeOf(next).label} set for ${email}`)
   }

   const setHours = (next: WorkingHours) => change([account], { hours: next }, `Working hours changed for ${email}`)

   return (
      <div className="grid gap-5">
         <Section title="Today">
            <p className="text-2xl font-semibold tabular-nums">{meterText(usedSeconds, limitSeconds)}</p>
            <UseBar usedSeconds={usedSeconds} limitSeconds={limitSeconds} className="h-1.5" />
            <p className="text-muted-foreground text-sm">{stateText(account)}</p>
            {account.viewsLeft !== null && account.viewsLeft > 0 ? (
               <p className="text-muted-foreground text-sm">
                  About {account.viewsLeft} profile views fit in what is left today.
               </p>
            ) : null}
         </Section>

         <Section title="Daily limit">
            <ModeCards mode={mode} onChange={setMode} />
         </Section>

         <Section title="Working hours">
            <HoursEditor
               key={JSON.stringify(hours)}
               mode={mode}
               hours={hours}
               proxyTimeZone={account.proxyTimeZone}
               onSave={setHours}
            />
         </Section>

         <Section title="Client">
            <ClientField
               key={account.clientLabel ?? ''}
               account={account}
               onChange={clientLabel => change([account], { clientLabel }, `Client changed for ${email}`)}
            />
         </Section>

         <Section title="Activity">
            <div className="flex items-center justify-between gap-2">
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
               <Button variant="ghost" size="sm" className="print:hidden" onClick={() => window.print()}>
                  <Printer />
                  Print
               </Button>
            </div>
            {yearDays.loading ? <Skeleton className="h-40 w-full" /> : null}
            {yearDays.error ? <p className="text-destructive text-sm">{yearDays.error}</p> : null}
            {hasAnyDay ? (
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

const ClientField = ({
   account,
   onChange,
}: {
   account: AccountBrowse
   onChange: (clientLabel: string | null) => void
}) => (
   <Input
      aria-label="Client"
      placeholder="Client (your own note)"
      className="h-8 w-56"
      defaultValue={account.clientLabel ?? ''}
      onBlur={event => {
         const value = event.target.value.trim()

         if (value !== (account.clientLabel ?? '')) {
            onChange(value || null)
         }
      }}
   />
)
