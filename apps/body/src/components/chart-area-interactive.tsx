import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useIsMobile } from '@/hooks/use-mobile'
import { useState } from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import { type DashboardOverview, type SeriesKey, dayLabel } from '@automatedLinkedIn/contracts'

import { ChartLegend } from './dashboard/chart-legend'
import { type DayCount, SERIES_KEYS, chartDescription, sliceSeries, toggleSeries } from './dashboard/chart-series'
import { seriesConfig } from './dashboard/series-config'

const RANGES: Array<{ value: DayCount; label: string }> = [
   {
      value: 90,
      label: 'Last 3 months',
   },
   {
      value: 30,
      label: 'Last 30 days',
   },
   {
      value: 7,
      label: 'Last 7 days',
   },
]

const rangeOf = (value: string) => RANGES.find(range => String(range.value) === value)?.value

// The day keys are UTC dates ("2026-11-13"), so they are written in UTC too.
const dateText = (day: string) =>
   new Date(day).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
   })

export const ChartAreaInteractive = ({ series }: { series: DashboardOverview['series'] }) => {
   const isMobile = useIsMobile()
   // The reader's choice wins; until they choose, small screens start on 7 days.
   const [chosenRange, setChosenRange] = useState<DayCount>()
   const [active, setActive] = useState<ReadonlySet<SeriesKey>>(() => new Set(SERIES_KEYS))
   const dayCount = chosenRange ?? (isMobile ? 7 : 90)
   const { days, totals, partialDays } = sliceSeries(series, dayCount)
   const last = series.at(-1)
   const empty = series.every(day => day.counted === 0)
   const choose = (value: string) => {
      const next = rangeOf(value)

      if (next) setChosenRange(next)
   }

   return (
      <Card className="@container/card">
         <CardHeader>
            <CardTitle>{last ? `Events per day, to ${dayLabel(last.day)} UTC` : 'Events per day'}</CardTitle>
            <CardDescription>
               {chartDescription({
                  totals,
                  dayCount,
                  partialDays,
                  active,
               })}
            </CardDescription>
            <CardAction>
               <ToggleGroup
                  type="single"
                  value={String(dayCount)}
                  onValueChange={choose}
                  variant="outline"
                  className="hidden *:data-[slot=toggle-group-item]:px-4! @[767px]/card:flex"
               >
                  {RANGES.map(range => (
                     <ToggleGroupItem key={range.value} value={String(range.value)}>
                        {range.label}
                     </ToggleGroupItem>
                  ))}
               </ToggleGroup>
               <Select value={String(dayCount)} onValueChange={choose}>
                  <SelectTrigger
                     className="flex w-40 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden"
                     size="sm"
                     aria-label="Select a range"
                  >
                     <SelectValue placeholder="Last 3 months" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                     {RANGES.map(range => (
                        <SelectItem key={range.value} value={String(range.value)} className="rounded-lg">
                           {range.label}
                        </SelectItem>
                     ))}
                  </SelectContent>
               </Select>
            </CardAction>
         </CardHeader>
         <CardContent className="grid gap-4 px-2 pt-4 sm:px-6 sm:pt-6">
            <ChartLegend
               keys={SERIES_KEYS}
               active={active}
               onToggle={key => setActive(current => toggleSeries(current, key))}
            />
            <div className="relative">
               <ChartContainer config={seriesConfig} className="aspect-auto h-[250px] w-full">
                  <AreaChart data={days}>
                     <defs>
                        {SERIES_KEYS.map(key => (
                           <linearGradient key={key} id={`fill-${key}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={`var(--color-${key})`} stopOpacity={0.8} />
                              <stop offset="95%" stopColor={`var(--color-${key})`} stopOpacity={0.1} />
                           </linearGradient>
                        ))}
                     </defs>
                     <CartesianGrid vertical={false} />
                     <XAxis
                        dataKey="day"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        minTickGap={32}
                        tickFormatter={dateText}
                     />
                     <YAxis hide allowDecimals={false} domain={empty ? [0, 1] : [0, 'auto']} />
                     <ChartTooltip
                        cursor={false}
                        content={
                           <ChartTooltipContent labelFormatter={label => dateText(String(label))} indicator="dot" />
                        }
                     />
                     {SERIES_KEYS.filter(key => active.has(key)).map(key => (
                        <Area
                           key={key}
                           dataKey={key}
                           type="natural"
                           fill={`url(#fill-${key})`}
                           stroke={`var(--color-${key})`}
                           dot={{
                              r: 2,
                              fill: `var(--color-${key})`,
                              fillOpacity: 1,
                           }}
                        />
                     ))}
                  </AreaChart>
               </ChartContainer>
               {empty ? (
                  <p className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center text-sm text-muted-foreground">
                     Nothing counted yet. Numbers appear about three days after a campaign starts.
                  </p>
               ) : null}
            </div>
         </CardContent>
      </Card>
   )
}

export const ChartSkeleton = () => (
   <Card className="@container/card">
      <CardHeader>
         <Skeleton className="h-5 w-56" />
         <Skeleton className="h-4 w-72" />
      </CardHeader>
      <CardContent>
         <Skeleton className="h-[250px] w-full" />
      </CardContent>
   </Card>
)
