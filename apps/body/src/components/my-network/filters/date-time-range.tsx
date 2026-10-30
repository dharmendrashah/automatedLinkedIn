import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { format, subMonths } from 'date-fns'
import { CalendarIcon, X } from 'lucide-react'
import { useId, useState } from 'react'
import { type DateRange as DayRange } from 'react-day-picker'

import { cn } from '@/lib/utils'

import { Field } from './fields'
import { type DateRange, QUICK_RANGES, fromLocal, rangeText } from './model'

const START = '00:00'
const END = '23:59'

const dayOf = (date: Date) => format(date, 'yyyy-MM-dd')
const timeOf = (value: string | undefined, fallback: string) => value?.slice(11, 16) ?? fallback

// A from and a to moment (shadcn date picker: a range calendar with quick choices and the times), either end may stay empty.
export const DateTimeRangeField = ({
   label,
   value,
   disabled = false,
   onChange,
}: {
   label: string
   value: DateRange
   disabled?: boolean
   onChange: (value: DateRange) => void
}) => {
   const id = useId()
   const [now] = useState(() => new Date())
   const text = rangeText(value)
   const from = fromLocal(value.from)
   const to = fromLocal(value.to)

   // New days keep the times already chosen; one day picked twice is that whole day.
   const pickDays = (range: DayRange | undefined) =>
      onChange({
         from: range?.from ? `${dayOf(range.from)}T${timeOf(value.from, START)}` : undefined,
         to: range?.to ? `${dayOf(range.to)}T${timeOf(value.to, END)}` : undefined,
      })

   const setTime = (end: 'from' | 'to', time: string) => {
      const moment = value[end]

      if (moment) {
         onChange({
            ...value,
            [end]: `${moment.slice(0, 10)}T${time || (end === 'from' ? START : END)}`,
         })
      }
   }

   return (
      <Field label={label} htmlFor={id}>
         <div className="flex items-center gap-1">
            <Popover>
               <PopoverTrigger asChild>
                  <Button
                     id={id}
                     variant="outline"
                     disabled={disabled}
                     data-empty={!text}
                     className="data-[empty=true]:text-muted-foreground flex-1 justify-start font-normal"
                  >
                     <CalendarIcon />
                     <span className="truncate">{text || 'Any time'}</span>
                  </Button>
               </PopoverTrigger>
               <PopoverContent className="w-auto p-0" align="end">
                  <div className="flex flex-col sm:flex-row">
                     <div className="flex flex-wrap gap-1 border-b p-2 sm:grid sm:content-start sm:border-r sm:border-b-0">
                        {QUICK_RANGES.map(([word, range]) => {
                           const quick = range(now)
                           const on = quick.from === value.from && quick.to === value.to

                           return (
                              <Button
                                 key={word}
                                 variant={on ? 'secondary' : 'ghost'}
                                 size="sm"
                                 className="justify-start"
                                 aria-pressed={on}
                                 onClick={() => onChange(on ? {} : quick)}
                              >
                                 {word}
                              </Button>
                           )
                        })}
                     </div>
                     <div>
                        <Calendar
                           mode="range"
                           numberOfMonths={2}
                           defaultMonth={from ?? subMonths(now, 1)}
                           selected={{
                              from,
                              to,
                           }}
                           disabled={{ after: now }}
                           onSelect={pickDays}
                        />
                        <div className="flex flex-wrap items-end gap-3 border-t p-3">
                           <div className="grid gap-1">
                              <Label htmlFor={`${id}-from`} className="text-muted-foreground text-xs">
                                 From time
                              </Label>
                              <Input
                                 id={`${id}-from`}
                                 type="time"
                                 className="w-32"
                                 value={timeOf(value.from, START)}
                                 disabled={!value.from}
                                 onChange={event => setTime('from', event.target.value)}
                              />
                           </div>
                           <div className="grid gap-1">
                              <Label htmlFor={`${id}-to`} className="text-muted-foreground text-xs">
                                 To time
                              </Label>
                              <Input
                                 id={`${id}-to`}
                                 type="time"
                                 className="w-32"
                                 value={timeOf(value.to, END)}
                                 disabled={!value.to}
                                 onChange={event => setTime('to', event.target.value)}
                              />
                           </div>
                           <Button
                              variant="ghost"
                              size="sm"
                              className="ml-auto"
                              disabled={!text}
                              onClick={() => onChange({})}
                           >
                              Clear
                           </Button>
                        </div>
                     </div>
                  </div>
               </PopoverContent>
            </Popover>
            <Button
               variant="ghost"
               size="icon"
               aria-label={`Clear ${label}`}
               className={cn(!text && 'invisible')}
               onClick={() => onChange({})}
            >
               <X />
            </Button>
         </div>
      </Field>
   )
}
