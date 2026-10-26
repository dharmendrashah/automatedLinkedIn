import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useMemo, useState } from 'react'

import {
   browserZone,
   describePlanned,
   fromInputs,
   plannedProblem,
   presets,
   toInputs,
} from './schedule'

export type Planned = {
   at: string
   zone: string
}

type Props = {
   open: boolean
   onOpenChange: (open: boolean) => void
   current: Planned | null
   onSave: (planned: Planned) => void
   onClear: () => void
}

const zonesWith = (zone: string) => {
   const zones = Intl.supportedValuesOf('timeZone')

   return zones.includes(zone) ? zones : [zone, ...zones]
}

const SELECT =
   'border-input bg-background h-9 w-full rounded-md border px-3 text-sm shadow-xs focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none'

type FormProps = Omit<Props, 'open' | 'onOpenChange'> & { onDone: () => void }

// Rebuilt each time the dialog opens, so it always starts from what is saved.
const ScheduleForm = ({ current, onSave, onClear, onDone }: FormProps) => {
   const [zone, setZone] = useState(current?.zone ?? browserZone())
   const start = current ? toInputs(current.at, current.zone) : { date: '', time: '09:00' }
   const [date, setDate] = useState(start.date)
   const [time, setTime] = useState(start.time)
   const [now] = useState(() => new Date())
   const zones = useMemo(() => zonesWith(zone), [zone])
   const chosen = fromInputs(date, time, zone)
   const problem =
      date === '' || time === ''
         ? undefined
         : chosen
           ? plannedProblem(chosen, now)
           : 'That time does not exist in this time zone. Choose another.'

   const pick = (at: Date) => {
      const inputs = toInputs(at.toISOString(), zone)

      setDate(inputs.date)
      setTime(inputs.time)
   }

   return (
      <>
         <DialogHeader>
            <DialogTitle>Plan a time</DialogTitle>
            <DialogDescription>
               The time is saved with the draft. Nothing is posted yet: posting is not connected, so the draft waits.
            </DialogDescription>
         </DialogHeader>

         <div className="grid gap-4">
            <div className="flex flex-wrap gap-2">
               {presets(now, zone).map(({ label, at }) => (
                  <Button key={label} type="button" variant="outline" size="sm" onClick={() => pick(at)}>
                     {label}
                  </Button>
               ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
               <div className="grid gap-1.5">
                  <Label htmlFor="plan-date">Date</Label>
                  <Input id="plan-date" type="date" value={date} onChange={event => setDate(event.target.value)} />
               </div>
               <div className="grid gap-1.5">
                  <Label htmlFor="plan-time">Time</Label>
                  <Input id="plan-time" type="time" value={time} onChange={event => setTime(event.target.value)} />
               </div>
            </div>

            <div className="grid gap-1.5">
               <Label htmlFor="plan-zone">Time zone</Label>
               <select id="plan-zone" className={SELECT} value={zone} onChange={event => setZone(event.target.value)}>
                  {zones.map(name => (
                     <option key={name} value={name}>
                        {name}
                     </option>
                  ))}
               </select>
            </div>

            <p role="status" className={problem ? 'text-destructive text-sm' : 'text-sm'}>
               {problem ??
                  (chosen
                     ? `Planned for ${describePlanned(chosen.toISOString(), zone)}.`
                     : 'Choose a date and a time, or one of the quick choices.')}
            </p>
         </div>

         <DialogFooter className="gap-2 sm:justify-between">
            {current ? (
               <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                     onClear()
                     onDone()
                  }}
               >
                  Remove the planned time
               </Button>
            ) : (
               <span />
            )}
            <div className="flex gap-2">
               <Button type="button" variant="outline" onClick={onDone}>
                  Cancel
               </Button>
               <Button
                  type="button"
                  disabled={!chosen || Boolean(problem)}
                  onClick={() => {
                     if (chosen) {
                        onSave({
                           at: chosen.toISOString(),
                           zone,
                        })
                        onDone()
                     }
                  }}
               >
                  Save the time
               </Button>
            </div>
         </DialogFooter>
      </>
   )
}

export const ScheduleDialog = ({ open, onOpenChange, ...form }: Props) => (
   <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
         <ScheduleForm key={String(open)} {...form} onDone={() => onOpenChange(false)} />
      </DialogContent>
   </Dialog>
)
