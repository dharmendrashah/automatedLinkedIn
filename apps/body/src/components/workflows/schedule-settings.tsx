import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CalendarClock, Check, Globe, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { cn } from '@/lib/utils'

import { trpc } from '../../trpc'
import {
   WEEKDAY_NAMES,
   allTimeZones,
   browserTimeZone,
   cityOf,
   daysOf,
   describeSchedule,
   offsetOf,
} from './schedule-text'
import { Chips, Stepper } from './setting-inputs'
import { type ConfigValue } from './types'

type Values = Record<string, ConfigValue | undefined>

type Props = {
   values: Values
   onChange: (key: string, value: ConfigValue) => void
}

const REPEATS = [
   {
      value: 'hours',
      emoji: '⏱️',
      title: 'Every few hours',
      hint: 'Catch new posts during the day',
   },
   {
      value: 'day',
      emoji: '📅',
      title: 'Every day',
      hint: 'Once a day, at a time you pick',
   },
   {
      value: 'weekdays',
      emoji: '💼',
      title: 'Weekdays',
      hint: 'Monday to Friday, skips weekends',
   },
   {
      value: 'week',
      emoji: '🗓️',
      title: 'Chosen days',
      hint: 'For example Monday and Thursday',
   },
   {
      value: 'month',
      emoji: '📆',
      title: 'Once a month',
      hint: 'On a day of the month',
   },
] as const

const HOUR_PRESETS = [1, 2, 3, 4, 6, 8, 12]

const TIME_PRESETS = [
   {
      value: '09:00',
      label: '☀️ Morning 9:00',
   },
   {
      value: '12:00',
      label: '🍽️ Noon 12:00',
   },
   {
      value: '15:00',
      label: '🌤️ Afternoon 15:00',
   },
   {
      value: '18:00',
      label: '🌆 Evening 18:00',
   },
]

const DAY_CHIPS = [1, 2, 3, 4, 5, 6, 0].map(day => ({
   value: String(day),
   label: WEEKDAY_NAMES[day].slice(0, 3),
}))

const MAX_ZONES_SHOWN = 60

const textAt = (values: Values, key: string, fallback: string) => {
   const value = values[key]

   return typeof value === 'string' ? value : fallback
}

const numberAt = (values: Values, key: string, fallback: number) => {
   const value = values[key]

   return typeof value === 'number' ? value : fallback
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
   <section className="grid gap-2">
      <p className="text-sm font-medium">{title}</p>
      {children}
   </section>
)

// Search every time zone by city, region or offset; the browser's own zone is one click away.
const TimeZonePicker = ({ value, onChange }: { value: string; onChange: (next: string) => void }) => {
   const [query, setQuery] = useState('')
   const [open, setOpen] = useState(false)
   const mine = browserTimeZone()
   const zones = useMemo(() => allTimeZones(), [])
   const words = query.trim().toLowerCase()
   const found = zones
      .filter(zone => !words || `${zone} ${cityOf(zone)} ${offsetOf(zone)}`.toLowerCase().includes(words))
      .slice(0, MAX_ZONES_SHOWN)

   return (
      <div className="grid gap-2">
         <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(current => !current)}>
               <Globe />
               {cityOf(value)} ({offsetOf(value)})
            </Button>
            {value === mine ? (
               <span className="text-muted-foreground text-xs">Your time zone</span>
            ) : (
               <Button type="button" variant="ghost" size="sm" onClick={() => onChange(mine)}>
                  Use mine: {cityOf(mine)}
               </Button>
            )}
         </div>
         {open ? (
            <div className="grid gap-2 rounded-lg border p-2">
               <div className="relative">
                  <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" aria-hidden />
                  <Input
                     autoFocus
                     className="pl-8"
                     aria-label="Search time zones"
                     placeholder="Search a city, such as London or Kolkata"
                     value={query}
                     onChange={event => setQuery(event.target.value)}
                  />
               </div>
               <div className="grid max-h-48 overflow-y-auto" role="listbox" aria-label="Time zones">
                  {found.map(zone => (
                     <button
                        key={zone}
                        type="button"
                        role="option"
                        aria-selected={zone === value}
                        onClick={() => {
                           onChange(zone)
                           setOpen(false)
                        }}
                        className="hover:bg-muted flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm"
                     >
                        <span>
                           {cityOf(zone)} <span className="text-muted-foreground text-xs">{zone}</span>
                        </span>
                        <span className="text-muted-foreground flex items-center gap-1 text-xs">
                           {offsetOf(zone)}
                           {zone === value ? <Check className="size-3.5" /> : null}
                        </span>
                     </button>
                  ))}
                  {found.length === 0 ? <p className="text-muted-foreground p-2 text-sm">No time zone matches.</p> : null}
               </div>
            </div>
         ) : null}
      </div>
   )
}

// The schedule block's own form: pick how often, then only what that choice needs, with a plain sentence and the
// next start times to check it.
export const ScheduleSettings = ({ values, onChange }: Props) => {
   const every = textAt(values, 'every', 'day')
   const timeZone = textAt(values, 'timeZone', browserTimeZone())
   const at = textAt(values, 'at', '09:00')
   const schedule = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined))
   const nextRuns = trpc.workflow.nextRuns.useQuery({ schedule }, { placeholderData: previous => previous })
   const when = new Intl.DateTimeFormat(undefined, {
      timeZone,
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
   })

   return (
      <div className="grid max-h-[60vh] gap-5 overflow-y-auto pr-1">
         <Section title="How often should it run?">
            <div className="grid gap-2 sm:grid-cols-2">
               {REPEATS.map(repeat => (
                  <button
                     key={repeat.value}
                     type="button"
                     aria-pressed={every === repeat.value}
                     onClick={() => onChange('every', repeat.value)}
                     className={cn(
                        'flex items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                        every === repeat.value ? 'border-primary bg-primary/5 ring-primary ring-1' : 'hover:bg-muted'
                     )}
                  >
                     <span className="text-xl" aria-hidden>
                        {repeat.emoji}
                     </span>
                     <span className="grid">
                        <span className="text-sm font-medium">{repeat.title}</span>
                        <span className="text-muted-foreground text-xs">{repeat.hint}</span>
                     </span>
                  </button>
               ))}
            </div>
         </Section>

         {every === 'hours' ? (
            <>
               <Section title="Run once every">
                  <div className="flex flex-wrap items-center gap-3">
                     <Chips
                        id="schedule-hour-presets"
                        options={HOUR_PRESETS.map(hours => ({
                           value: String(hours),
                           label: hours === 1 ? '1 hour' : `${hours} hours`,
                        }))}
                        isOn={option => numberAt(values, 'hours', 24) === Number(option)}
                        onToggle={option => onChange('hours', Number(option))}
                     />
                     <Stepper
                        id="schedule-hours"
                        value={numberAt(values, 'hours', 24)}
                        min={1}
                        max={24}
                        onChange={next => onChange('hours', next)}
                     />
                  </div>
               </Section>
               <Section title="Limits (optional)">
                  <div className="flex items-center gap-2">
                     <Checkbox
                        id="schedule-between"
                        checked={values.between === true}
                        onCheckedChange={checked => onChange('between', checked === true)}
                     />
                     <Label htmlFor="schedule-between" className="font-normal">
                        Only during working hours
                     </Label>
                  </div>
                  {values.between === true ? (
                     <div className="flex flex-wrap items-center gap-2 pl-6 text-sm">
                        From
                        <Input
                           type="time"
                           className="w-32"
                           aria-label="From"
                           value={textAt(values, 'from', '09:00')}
                           onChange={event => onChange('from', event.target.value)}
                        />
                        until
                        <Input
                           type="time"
                           className="w-32"
                           aria-label="Until"
                           value={textAt(values, 'until', '18:00')}
                           onChange={event => onChange('until', event.target.value)}
                        />
                     </div>
                  ) : null}
                  <div className="flex items-center gap-2">
                     <Checkbox
                        id="schedule-weekdays-only"
                        checked={values.weekdaysOnly === true}
                        onCheckedChange={checked => onChange('weekdaysOnly', checked === true)}
                     />
                     <Label htmlFor="schedule-weekdays-only" className="font-normal">
                        Skip Saturday and Sunday
                     </Label>
                  </div>
               </Section>
            </>
         ) : null}

         {every === 'week' ? (
            <Section title="On which days?">
               <Chips
                  id="schedule-days"
                  options={DAY_CHIPS}
                  isOn={option => daysOf(values).includes(Number(option))}
                  onToggle={option => {
                     const chosen = new Set(daysOf(values).map(String))

                     if (chosen.has(option) && chosen.size > 1) {
                        chosen.delete(option)
                     } else {
                        chosen.add(option)
                     }

                     onChange(
                        'days',
                        DAY_CHIPS.map(({ value }) => value).filter(day => chosen.has(day))
                     )
                  }}
               />
            </Section>
         ) : null}

         {every === 'month' ? (
            <Section title="On which day of the month?">
               <Stepper
                  id="schedule-day-of-month"
                  value={numberAt(values, 'dayOfMonth', 1)}
                  min={1}
                  max={28}
                  onChange={next => onChange('dayOfMonth', next)}
               />
               <p className="text-muted-foreground text-xs">Up to the 28th, so it happens every month.</p>
            </Section>
         ) : null}

         {every === 'hours' ? null : (
            <Section title="At what time?">
               <div className="flex flex-wrap items-center gap-2">
                  <Chips
                     id="schedule-time-presets"
                     options={TIME_PRESETS}
                     isOn={option => at === option}
                     onToggle={option => onChange('at', option)}
                  />
                  <Input
                     type="time"
                     className="w-32"
                     aria-label="Another time"
                     value={at}
                     onChange={event => onChange('at', event.target.value)}
                  />
               </div>
            </Section>
         )}

         <Section title="In which time zone?">
            <TimeZonePicker value={timeZone} onChange={next => onChange('timeZone', next)} />
         </Section>

         <div className="bg-muted/50 grid gap-2 rounded-lg border p-3 text-sm">
            <p className="flex items-start gap-2 font-medium">
               <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden />
               {describeSchedule({
                  ...values,
                  timeZone,
               })}
            </p>
            {nextRuns.data && nextRuns.data.length > 0 ? (
               <div className="text-muted-foreground grid gap-0.5 pl-6 text-xs">
                  <span>Next runs, once it is switched on:</span>
                  {nextRuns.data.map(run => (
                     <span key={run}>• {when.format(new Date(run))}</span>
                  ))}
               </div>
            ) : (
               <p className="text-destructive pl-6 text-xs">Check the times: the end must be after the start.</p>
            )}
         </div>
      </div>
   )
}
