import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Activity } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import {
   CAMPAIGN_TREND_PERIODS,
   type CampaignTrendDay,
   type CampaignTrendPeriod,
} from '@automatedLinkedIn/contracts'

import { trendPoints, TREND_PERIOD_LABELS } from './campaign-insights'

const chartConfig = {
   invited: { label: 'Invited', color: 'var(--chart-1)' },
   accepted: { label: 'Accepted', color: 'var(--chart-2)' },
} satisfies ChartConfig

const compact = new Intl.NumberFormat('en-US', { notation: 'compact' })

export const CampaignTrendChart = ({
   history,
   period,
   onPeriodChange,
   animate,
}: {
   history: CampaignTrendDay[]
   period: CampaignTrendPeriod
   onPeriodChange: (next: CampaignTrendPeriod) => void
   animate: boolean
}) => (
   <Card>
      <CardHeader>
         <CardTitle className="flex items-center gap-2">
            <Activity aria-hidden className="size-4" />
            Invites and accepts over time
         </CardTitle>
         <CardDescription>Daily totals for the selected period.</CardDescription>
         <CardAction>
            <ToggleGroup
               type="single"
               variant="outline"
               value={period}
               aria-label="Trend period"
               onValueChange={next => {
                  if (next) onPeriodChange(next as CampaignTrendPeriod)
               }}
            >
               {CAMPAIGN_TREND_PERIODS.map(each => (
                  <ToggleGroupItem key={each} value={each} aria-label={TREND_PERIOD_LABELS[each]}>
                     {TREND_PERIOD_LABELS[each]}
                  </ToggleGroupItem>
               ))}
            </ToggleGroup>
         </CardAction>
      </CardHeader>
      <CardContent>
         <ChartContainer
            config={chartConfig}
            className="aspect-auto h-64 w-full"
            role="img"
            aria-label={`Invites and accepts per day, ${TREND_PERIOD_LABELS[period]}`}
         >
            <AreaChart data={trendPoints(history)} margin={{ left: 12, right: 12 }}>
               <CartesianGrid vertical={false} />
               <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={16}
                  tickFormatter={(value: string) => value.slice(5)}
               />
               <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tickFormatter={(value: number) => compact.format(value)}
               />
               <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
               <Area
                  dataKey="invited"
                  type="monotone"
                  stroke="var(--color-invited)"
                  fill="var(--color-invited)"
                  fillOpacity={0.2}
                  connectNulls={false}
                  isAnimationActive={animate}
               />
               <Area
                  dataKey="accepted"
                  type="monotone"
                  stroke="var(--color-accepted)"
                  fill="var(--color-accepted)"
                  fillOpacity={0.2}
                  connectNulls={false}
                  isAnimationActive={animate}
               />
            </AreaChart>
         </ChartContainer>
      </CardContent>
   </Card>
)
