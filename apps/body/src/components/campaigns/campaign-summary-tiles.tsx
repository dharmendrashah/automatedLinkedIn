import { Card, CardContent, CardDescription } from '@/components/ui/card'
import { CircleCheck, type LucideIcon, Send, Target, Users } from 'lucide-react'

import type { CampaignTrendDay } from '@automatedLinkedIn/contracts'

import { sparklineSeries } from './campaign-insights'
import { useCountUp } from './use-count-up'

type Funnel = { found: number; qualified: number; invited: number; accepted: number }

const TILES: { key: keyof Funnel; label: string; icon: LucideIcon }[] = [
   { key: 'found', label: 'Found', icon: Users },
   { key: 'qualified', label: 'Qualified', icon: Target },
   { key: 'invited', label: 'Invited', icon: Send },
   { key: 'accepted', label: 'Accepted', icon: CircleCheck },
]

const WIDTH = 100
const HEIGHT = 28

// A null day breaks the line into separate pieces, so a gap never drops to zero.
const Sparkline = ({ values }: { values: (number | null)[] }) => {
   const counted = values.filter((value): value is number => value !== null)
   if (counted.length < 2) return null
   const max = Math.max(...counted, 1)
   const step = WIDTH / (values.length - 1)
   const pieces: string[][] = []
   values.forEach((value, index) => {
      if (value === null) {
         pieces.push([])
         return
      }
      const point = `${(index * step).toFixed(1)},${(HEIGHT - (value / max) * HEIGHT).toFixed(1)}`
      const last = pieces.at(-1)
      if (last) last.push(point)
      else pieces.push([point])
   })
   return (
      <svg aria-hidden viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-7 w-full overflow-visible" preserveAspectRatio="none">
         {pieces
            .filter(points => points.length > 0)
            .map(points => (
               <polyline
                  key={points[0]}
                  points={points.join(' ')}
                  fill="none"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
               />
            ))}
      </svg>
   )
}

const StatTile = ({
   label,
   icon: Icon,
   value,
   spark,
}: {
   label: string
   icon: LucideIcon
   value: number
   spark: (number | null)[] | null
}) => {
   const shown = useCountUp(value)
   return (
      <Card>
         <CardContent className="grid gap-1">
            <CardDescription className="flex items-center gap-2">
               <Icon aria-hidden className="size-4" />
               {label}
            </CardDescription>
            <span className="text-3xl font-semibold tabular-nums">{shown}</span>
            {spark ? <Sparkline values={spark} /> : null}
         </CardContent>
      </Card>
   )
}

// The sparklines show the last 14 counted days; they appear only once the trend has loaded.
export const CampaignSummaryTiles = ({ funnel, history }: { funnel: Funnel; history?: CampaignTrendDay[] }) => (
   <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {TILES.map(({ key, label, icon }) => (
         <StatTile
            key={key}
            label={label}
            icon={icon}
            value={funnel[key]}
            spark={history ? sparklineSeries(history, key) : null}
         />
      ))}
   </div>
)
