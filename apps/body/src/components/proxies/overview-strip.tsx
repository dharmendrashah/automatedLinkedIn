import { tone } from '@/lib/tone'

import { cn } from '@/lib/utils'

import { type LevelFilter } from './grouping'
import { type HealthLevel, levelInfo } from './health'

// The levels shown as tiles, in the order a person should care about them. A level with nobody in it, apart from the
// three main ones, is left out so the strip stays short.
const TILES: { level: HealthLevel; always: boolean }[] = [
   {
      level: 'HEALTHY',
      always: true,
   },
   {
      level: 'WATCH',
      always: true,
   },
   {
      level: 'RISK',
      always: true,
   },
   {
      level: 'ACCEPTED',
      always: false,
   },
   {
      level: 'CHECKING',
      always: false,
   },
]

type Props = {
   counts: Record<HealthLevel, number>
   filter: LevelFilter
   onFilter: (filter: LevelFilter) => void
}

// How many proxies are in each state. Each tile also filters the page to those proxies; pressing it again shows all.
export const OverviewStrip = ({ counts, filter, onFilter }: Props) => (
   <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
      role="group"
      aria-label="Show proxies by health"
   >
      {TILES.filter(tile => tile.always || counts[tile.level] > 0).map(({ level }) => {
         const { label, tone: levelTone, icon: Icon } = levelInfo[level]
         const active = filter === level

         return (
            <button
               key={level}
               type="button"
               aria-pressed={active}
               onClick={() => onFilter(active ? 'ALL' : level)}
               className={cn(
                  'bg-card focus-visible:ring-ring/50 flex items-center gap-3 rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-[3px]',
                  counts[level] > 0 ? tone[levelTone].panel : '',
                  active && 'ring-primary/40 ring-2'
               )}
            >
               <Icon
                  className={cn('size-5 shrink-0', tone[levelTone].text, level === 'CHECKING' && 'animate-spin')}
                  aria-hidden
               />
               <span className="grid">
                  <span className={cn('text-2xl leading-none font-semibold tabular-nums', tone[levelTone].text)}>
                     {counts[level]}
                  </span>
                  <span className="text-muted-foreground text-xs">{label}</span>
               </span>
            </button>
         )
      })}
   </div>
)
