import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import type { CampaignTrendDay } from '@automatedLinkedIn/contracts'

import { trendPoints } from './campaign-insights'

const chartConfig = {
   invited: { label: 'Invited', color: 'var(--chart-1)' },
   accepted: { label: 'Accepted', color: 'var(--chart-2)' },
} satisfies ChartConfig

export const CampaignTrendChart = ({ history, animate }: { history: CampaignTrendDay[]; animate: boolean }) => (
   <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
      <AreaChart data={trendPoints(history)} margin={{ left: 12, right: 12 }}>
         <CartesianGrid vertical={false} />
         <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(value: string) => value.slice(5)}
         />
         <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
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
)
