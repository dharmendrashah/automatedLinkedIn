import { Button } from '@/components/ui/button'
import { type KeyboardEvent, useMemo, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

import { type DayUsage, type WorkingHours } from './types'

import { formatMinutes } from './format'
import { type Level, buildYear, dayLabel, levelOf, summaryText, tooltipText, weekdayOf } from './heatmap-grid'

const LEVEL_CLASS: Record<Level, string> = {
   0: 'bg-muted',
   1: 'bg-primary/25',
   2: 'bg-primary/45',
   3: 'bg-primary/70',
   4: 'bg-primary',
   over: 'bg-warning ring-1 ring-warning/50 ring-offset-1 ring-offset-background',
}

// Browsing on a day the account does not work is striped, so it stands out from the office days.
const OFF_DAY = 'bg-[image:repeating-linear-gradient(135deg,transparent_0_2px,rgb(255_255_255/0.6)_2px_3px)]'

const CELL = 12
const GAP = 3
const WEEKS = 53
const DAY_ROWS: Record<number, string> = { 1: 'Mon', 3: 'Wed', 5: 'Fri' }

type Hover = {
   text: string
   left: number
   top: number
}

type Props = {
   days: DayUsage[]
   lastDay: string
   hours: WorkingHours
   selectedDay: string | null
   onSelect: (day: string) => void
}

const Legend = () => (
   <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <span className="flex items-center gap-1">
         Less
         {([0, 1, 2, 3, 4] as const).map(level => (
            <span key={level} className={cn('size-3 rounded-[3px]', LEVEL_CLASS[level])} />
         ))}
         More of the daily limit
      </span>
      <span className="flex items-center gap-1">
         <span className={cn('size-3 rounded-[3px]', LEVEL_CLASS.over)} />
         Over the limit
      </span>
      <span className="flex items-center gap-1">
         <span className={cn('size-3 rounded-[3px]', LEVEL_CLASS[2], OFF_DAY)} />
         On a day off
      </span>
   </div>
)

const DaysTable = ({ days }: { days: DayUsage[] }) => (
   <div className="max-h-64 overflow-y-auto rounded-md border">
      <table className="w-full text-sm">
         <thead className="bg-muted/50 text-muted-foreground sticky top-0 text-left text-xs">
            <tr>
               <th className="px-3 py-1.5 font-medium">Day</th>
               <th className="px-3 py-1.5 font-medium">Browsed</th>
               <th className="px-3 py-1.5 font-medium">Limit</th>
               <th className="px-3 py-1.5 font-medium">Sessions</th>
            </tr>
         </thead>
         <tbody>
            {days
               .filter(({ seconds }) => seconds > 0)
               .sort((a, b) => b.day.localeCompare(a.day))
               .map(item => (
                  <tr key={item.day} className="border-t">
                     <td className="px-3 py-1.5">{dayLabel(item.day)}</td>
                     <td className="px-3 py-1.5 tabular-nums">{formatMinutes(item.seconds)}</td>
                     <td className="px-3 py-1.5 tabular-nums">{formatMinutes(item.limitSeconds)}</td>
                     <td className="px-3 py-1.5 tabular-nums">{item.sessions}</td>
                  </tr>
               ))}
         </tbody>
      </table>
   </div>
)

// The year at a glance, like a contribution graph: a square for each day, shaded by the share of that account's own daily
// limit. A tap or Enter on a day selects it.
export const BrowsingHeatmap = ({ days, lastDay, hours, selectedDay, onSelect }: Props) => {
   const grid = useMemo(() => buildYear(days, lastDay), [days, lastDay])
   const [hover, setHover] = useState<Hover | null>(null)
   const [asTable, setAsTable] = useState(false)
   const frame = useRef<HTMLDivElement>(null)
   const focusDay = selectedDay ?? lastDay
   const firstDay = grid.weeks[0]?.[0]?.day ?? lastDay
   const shown = days.filter(({ day }) => day >= firstDay && day <= lastDay)

   const show = (element: HTMLElement, text: string) => {
      const box = frame.current?.getBoundingClientRect()
      const cell = element.getBoundingClientRect()

      if (box) {
         setHover({
            text,
            left: cell.left - box.left + cell.width / 2,
            top: cell.top - box.top,
         })
      }
   }

   const move = (event: KeyboardEvent<HTMLDivElement>) => {
      const steps: Record<string, [number, number]> = {
         ArrowLeft: [-1, 0],
         ArrowRight: [1, 0],
         ArrowUp: [0, -1],
         ArrowDown: [0, 1],
      }
      const step = steps[event.key]
      const { week, row } = (event.target as HTMLElement).dataset

      if (!step || week === undefined || row === undefined) {
         return
      }

      const next = frame.current?.querySelector<HTMLElement>(
         `[data-week="${Number(week) + step[0]}"][data-row="${Number(row) + step[1]}"]`
      )

      if (next) {
         event.preventDefault()
         next.focus()
      }
   }

   if (asTable) {
      return (
         <div className="grid gap-2">
            <DaysTable days={days} />
            <Button variant="ghost" size="sm" className="w-fit" onClick={() => setAsTable(false)}>
               Show as a graph
            </Button>
         </div>
      )
   }

   return (
      <div className="grid gap-2">
         <p className="text-sm">{summaryText(shown)}</p>
         <div ref={frame} className="relative overflow-x-auto pb-1" onMouseLeave={() => setHover(null)}>
            <div className="grid w-max grid-cols-[auto_1fr] gap-x-2 gap-y-1">
               <span />
               <div
                  className="text-muted-foreground relative grid h-4 text-xs"
                  style={{ gridTemplateColumns: `repeat(${WEEKS}, ${CELL}px)`, columnGap: GAP }}
               >
                  {grid.months.map(({ label, week }) => (
                     <span key={`${label}-${week}`} style={{ gridColumnStart: week + 1 }}>
                        {label}
                     </span>
                  ))}
               </div>
               <div
                  className="text-muted-foreground grid text-xs leading-none"
                  style={{ gridTemplateRows: `repeat(7, ${CELL}px)`, rowGap: GAP }}
               >
                  {Array.from({ length: 7 }, (_, row) => (
                     <span key={row} className="flex items-center">
                        {DAY_ROWS[row + 1] ?? ''}
                     </span>
                  ))}
               </div>
               <div
                  className="grid grid-flow-col"
                  role="grid"
                  aria-label="Browsing by day"
                  style={{
                     gridTemplateColumns: `repeat(${WEEKS}, ${CELL}px)`,
                     gridTemplateRows: `repeat(7, ${CELL}px)`,
                     gap: GAP,
                  }}
                  onKeyDown={move}
               >
                  {grid.weeks.map((week, weekIndex) =>
                     week.map((cell, row) => {
                        if (!cell) {
                           return <span key={`${weekIndex}-${row}`} aria-hidden />
                        }

                        const text = tooltipText(cell)
                        const off = cell.seconds > 0 && !hours.days.includes(weekdayOf(cell.day))

                        return (
                           <button
                              key={cell.day}
                              type="button"
                              data-week={weekIndex}
                              data-row={row}
                              aria-label={text}
                              aria-pressed={selectedDay === cell.day}
                              tabIndex={cell.day === focusDay ? 0 : -1}
                              className={cn(
                                 'rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                 LEVEL_CLASS[levelOf(cell.seconds, cell.limitSeconds)],
                                 off && OFF_DAY,
                                 selectedDay === cell.day && 'outline-2 outline-offset-1 outline-foreground'
                              )}
                              onClick={() => onSelect(cell.day)}
                              onMouseEnter={event => show(event.currentTarget, text)}
                              onFocus={event => show(event.currentTarget, text)}
                              onBlur={() => setHover(null)}
                           />
                        )
                     })
                  )}
               </div>
            </div>
            {hover ? (
               <div
                  role="tooltip"
                  className="bg-popover text-popover-foreground pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border px-2 py-1 text-xs whitespace-nowrap shadow-md"
                  style={{ left: hover.left, top: hover.top - 6 }}
               >
                  {hover.text}
               </div>
            ) : null}
         </div>
         <div className="flex flex-wrap items-center justify-between gap-2">
            <Legend />
            <Button variant="ghost" size="sm" onClick={() => setAsTable(true)}>
               Show as a table
            </Button>
         </div>
      </div>
   )
}
