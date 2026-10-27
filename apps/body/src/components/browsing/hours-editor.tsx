import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useEffect, useState } from 'react'

import { type BrowseMode, type WorkingHours } from './types'

import { clock, hoursProblem, spreadSentence } from './format'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const COMMON_ZONES = [
   'UTC',
   'Europe/London',
   'Europe/Berlin',
   'America/New_York',
   'America/Chicago',
   'America/Los_Angeles',
   'Asia/Kolkata',
   'Asia/Singapore',
   'Australia/Sydney',
]

const toMinute = (value: string) => {
   const [hour = 0, minute = 0] = value.split(':').map(Number)

   return hour * 60 + minute
}

type Props = {
   // The most demanding mode among the accounts being changed: the hours must fit it.
   mode: BrowseMode
   hours: WorkingHours
   proxyTimeZone: string | undefined
   saveLabel?: string
   onSave: (hours: WorkingHours) => void
   // Told when there are changes not saved yet, so the caller can ask before closing.
   onDirtyChange?: (dirty: boolean) => void
}

// Working days, hours and time zone. What they mean is written out as the owner types, and hours that cannot hold the daily
// limit cannot be saved.
export const HoursEditor = ({ mode, hours, proxyTimeZone, saveLabel = 'Save hours', onSave, onDirtyChange }: Props) => {
   const [draft, setDraft] = useState(hours)
   const problem = hoursProblem(mode, draft)
   const changed = JSON.stringify(draft) !== JSON.stringify(hours)

   useEffect(() => {
      onDirtyChange?.(changed)

      return () => onDirtyChange?.(false)
   }, [changed, onDirtyChange])
   const zones = [...new Set([draft.timeZone, proxyTimeZone, ...COMMON_ZONES])].filter(
      (zone): zone is string => typeof zone === 'string'
   )

   return (
      <div className="grid gap-3">
         <ToggleGroup
            type="multiple"
            variant="outline"
            size="sm"
            aria-label="Working days"
            value={draft.days.map(String)}
            onValueChange={values => setDraft({ ...draft, days: values.map(Number).sort((a, b) => a - b) })}
         >
            {DAYS.map((name, index) => (
               <ToggleGroupItem key={name} value={String(index + 1)} aria-label={name}>
                  {name}
               </ToggleGroupItem>
            ))}
         </ToggleGroup>
         <div className="flex flex-wrap items-center gap-2">
            <Input
               type="time"
               aria-label="Start of the working day"
               className="w-28"
               value={clock(draft.startMinute)}
               onChange={event =>
                  event.target.value ? setDraft({ ...draft, startMinute: toMinute(event.target.value) }) : undefined
               }
            />
            <span className="text-muted-foreground text-sm">to</span>
            <Input
               type="time"
               aria-label="End of the working day"
               className="w-28"
               value={clock(draft.endMinute)}
               onChange={event =>
                  event.target.value ? setDraft({ ...draft, endMinute: toMinute(event.target.value) }) : undefined
               }
            />
            <Select value={draft.timeZone} onValueChange={timeZone => setDraft({ ...draft, timeZone })}>
               <SelectTrigger className="w-56" aria-label="Time zone">
                  <SelectValue />
               </SelectTrigger>
               <SelectContent>
                  {zones.map(zone => (
                     <SelectItem key={zone} value={zone}>
                        {zone}
                        {zone === proxyTimeZone ? ' (where the proxy is)' : ''}
                     </SelectItem>
                  ))}
               </SelectContent>
            </Select>
         </div>
         {problem ? (
            <p className="text-destructive text-sm" role="alert">
               {problem}
            </p>
         ) : (
            <p className="text-muted-foreground text-sm">{spreadSentence(mode, draft)}</p>
         )}
         <div className="flex gap-2">
            <Button size="sm" disabled={Boolean(problem) || !changed} onClick={() => onSave(draft)}>
               {saveLabel}
            </Button>
            {changed ? (
               <Button size="sm" variant="ghost" onClick={() => setDraft(hours)}>
                  Cancel
               </Button>
            ) : null}
         </div>
      </div>
   )
}
