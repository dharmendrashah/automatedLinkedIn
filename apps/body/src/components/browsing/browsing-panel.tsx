import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Printer } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { type AccountBrowse, type DayUsage, type WorkingHours } from './types'

import { BrowsingHeatmap } from './browsing-heatmap'
import { formatMinutes, hoursProblem, meterText, stateText } from './format'
import { dayLabel } from './heatmap-grid'
import { HoursEditor } from './hours-editor'
import { ModeCards } from './mode-cards'
import { limitSecondsOf, modeOf } from './modes'
import { type SampleKind, dayOf, sampleDays, sampleMix, sampleSessions } from './sample'
import { UseBar } from './use-bar'
import { changeBrowse } from './use-browse'

type Props = {
   account: AccountBrowse
   kind: SampleKind
   now: Date
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
   <section className="grid gap-2 print:break-inside-avoid">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
   </section>
)

const DaySessions = ({ accountId, usage }: { accountId: string; usage: DayUsage | undefined }) => {
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
         <ul className="divide-y rounded-md border text-sm">
            {sampleSessions(accountId, usage).map(session => (
               <li key={session.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                  <span className="tabular-nums">{session.at}</span>
                  <span className="min-w-0 flex-1 truncate">{session.action}</span>
                  <span className="text-muted-foreground tabular-nums">{formatMinutes(session.seconds)}</span>
                  <span className="text-muted-foreground w-20 text-right">{session.result}</span>
               </li>
            ))}
         </ul>
      </div>
   )
}

// Everything about one account's browsing time, once. It is shown in the drawer beside the table and inline on the account's own
// page. The numbers are invented until brain serves them (see the sample kind).
export const BrowsingPanel = ({ account, kind, now }: Props) => {
   const { accountId, email, mode, hours, usedSeconds } = account
   const today = dayOf(now)
   const thisYear = Number(today.slice(0, 4))
   const [year, setYear] = useState<'recent' | number>('recent')
   const [selectedDay, setSelectedDay] = useState<string | null>(null)
   const days = useMemo(() => sampleDays(kind, accountId, now), [kind, accountId, now])
   const limitSeconds = limitSecondsOf(mode)
   const mix = sampleMix(usedSeconds)
   const hasAnyDay = days.length > 0

   const setMode = (next: typeof mode) => {
      const problem = hoursProblem(next, hours)

      if (problem) {
         toast.error(`${modeOf(next).label} is not possible with these hours. ${problem}`)

         return
      }

      changeBrowse([accountId], { mode: next }, `${modeOf(next).label} set for ${email}`)
   }

   const setHours = (next: WorkingHours) =>
      changeBrowse([accountId], { hours: next }, `Working hours changed for ${email}`)

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
            <ClientField key={account.clientLabel ?? ''} account={account} />
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
            {hasAnyDay ? (
               <>
                  <BrowsingHeatmap
                     days={days}
                     lastDay={year === 'recent' ? today : `${year}-12-31`}
                     hours={hours}
                     selectedDay={selectedDay}
                     onSelect={setSelectedDay}
                  />
                  <DaySessions
                     accountId={accountId}
                     usage={
                        days.find(item => item.day === selectedDay) ??
                        (selectedDay ? { day: selectedDay, seconds: 0, sessions: 0, limitSeconds } : undefined)
                     }
                  />
               </>
            ) : (
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

const ClientField = ({ account }: { account: AccountBrowse }) => (
   <Input
      aria-label="Client"
      placeholder="Client (your own note)"
      className="h-8 w-56"
      defaultValue={account.clientLabel ?? ''}
      onBlur={event => {
         const value = event.target.value.trim()

         if (value !== (account.clientLabel ?? '')) {
            changeBrowse([account.accountId], { clientLabel: value || null }, `Client changed for ${account.email}`)
         }
      }}
   />
)
