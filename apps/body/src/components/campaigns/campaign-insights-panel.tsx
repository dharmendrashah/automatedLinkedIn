import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Sparkles, TriangleAlert } from 'lucide-react'

import type { CampaignInsights, CampaignTrendDay, CampaignTrendPeriod } from '@automatedLinkedIn/contracts'

import { CampaignCapacity } from './campaign-capacity'
import { prefersReducedMotion, projectionBand, projectionBasis, projectionNote } from './campaign-insights'
import { CampaignListsStrip } from './campaign-lists-strip'
import { CampaignTrendChart } from './campaign-trend-chart'

type Insights = CampaignInsights
type Band = { label: string; low: number; high: number }

export type CampaignTrend = {
   history: CampaignTrendDay[] | undefined
   period: CampaignTrendPeriod
   onPeriodChange: (next: CampaignTrendPeriod) => void
}

const todayKey = () => new Date().toISOString().slice(0, 10)

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const percentOf = (value: number, max: number) => `${(value / max) * 100}%`

const RangeRow = ({ band, max }: { band: Band; max: number }) => (
   <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2 text-sm">
         <span className="font-medium">{band.label}</span>
         <span className="tabular-nums">
            {band.low} to {band.high} invites
         </span>
      </div>
      <div className="bg-muted relative h-2 rounded-full">
         <div
            className="bg-primary absolute inset-y-0 rounded-full"
            style={{ left: percentOf(band.low, max), width: percentOf(band.high - band.low, max) }}
         />
      </div>
   </div>
)

const ProjectionBlock = ({ insights }: { insights: Insights }) => {
   const { projection, gate } = insights
   const title = (
      <CardTitle className="flex items-center gap-2">
         <Sparkles aria-hidden className="size-4" />
         Projection
      </CardTitle>
   )
   if (projection.status === 'hidden') {
      // The tooEarly reason is shown by the Alert in CampaignInsightsPanel.
      if (projection.reason === 'tooEarly') return null
      return (
         <Card>
            <CardHeader>{title}</CardHeader>
            <CardContent>
               <p className="text-muted-foreground text-sm">{projectionNote(projection, gate)}</p>
            </CardContent>
         </Card>
      )
   }
   const bands = projectionBand(projection) ?? []
   // Both ranges share one scale so the 7-day and 30-day bars compare.
   const max = Math.max(...bands.map(band => band.high), 1)
   return (
      <Card>
         <CardHeader>
            {title}
            <CardDescription>At this pace, not a forecast. {projectionBasis(projection.basis)}</CardDescription>
         </CardHeader>
         <CardContent className="grid gap-4">
            {bands.map(band => (
               <RangeRow key={band.label} band={band} max={max} />
            ))}
         </CardContent>
      </Card>
   )
}

const TrendSummary = ({ insights }: { insights: Insights }) => {
   const { totals, since, updatedAt, history } = insights
   const last = history.at(-1)
   const soFar = last?.day === todayKey()
   const skipped = totals.skippedDays
   return (
      <div className="grid gap-3">
         <p className="text-muted-foreground text-sm">
            {totals.sinceApplies && since !== null && `Counted since ${since}. `}
            {skipped > 0 &&
               `${skipped} ${skipped === 1 ? 'day' : 'days'} with no data ${skipped === 1 ? 'is' : 'are'} not counted. `}
            {updatedAt !== null && `Updated ${formatTime(updatedAt)}${soFar ? ' (today is so far)' : ''}. `}
         </p>
         <p className="text-muted-foreground text-xs">
            Accepted can count a person twice if they are invited again and accept again. Messaged and replied are per
            day, so they are not added up.
         </p>
      </div>
   )
}

export const CampaignInsightsPanel = ({
   insights,
   trend,
   campaignLabel,
}: {
   insights: Insights
   trend: CampaignTrend
   campaignLabel: string
}) => {
   if (insights.state === 'empty') return <CampaignCapacity insights={insights} />
   const animate = !prefersReducedMotion()
   return (
      <section className="grid gap-4">
         {insights.state === 'tooEarly' ? (
            <Alert>
               <TriangleAlert aria-hidden />
               <AlertTitle>Too early to judge</AlertTitle>
               <AlertDescription>{projectionNote(insights.projection, insights.gate)}</AlertDescription>
            </Alert>
         ) : (
            <TrendSummary insights={insights} />
         )}
         {trend.history ? (
            <CampaignTrendChart
               history={trend.history}
               period={trend.period}
               onPeriodChange={trend.onPeriodChange}
               animate={animate}
            />
         ) : (
            <Skeleton aria-hidden className="h-80 w-full rounded-xl" />
         )}
         <ProjectionBlock insights={insights} />
         <CampaignListsStrip lists={insights.lists} campaignLabel={campaignLabel} />
      </section>
   )
}
