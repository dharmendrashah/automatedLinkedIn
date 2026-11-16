import type { SeriesKey } from '@automatedLinkedIn/contracts'

import { cn } from '@/lib/utils'

import { seriesConfig } from './series-config'

// One button per series: pressed series are drawn, the others are not (the chart keeps at least one on).
export const ChartLegend = ({
   keys,
   active,
   onToggle,
}: {
   keys: SeriesKey[]
   active: ReadonlySet<SeriesKey>
   onToggle: (key: SeriesKey) => void
}) => (
   <div className="flex flex-wrap items-center gap-2 text-sm">
      {keys.map(key => {
         const on = active.has(key)

         return (
            <button
               key={key}
               type="button"
               aria-pressed={on}
               onClick={() => onToggle(key)}
               className={cn(
                  'flex items-center gap-1.5 rounded-md border px-2 py-1 transition-opacity hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                  !on && 'text-muted-foreground opacity-60'
               )}
            >
               <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: seriesConfig[key].color }}
               />
               {seriesConfig[key].label}
            </button>
         )
      })}
   </div>
)
