import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Sparkles, TriangleAlert } from 'lucide-react'

import type { CampaignInsights, CampaignPeriod } from '@automatedLinkedIn/contracts'

import { CampaignCapacity } from './campaign-capacity'
import { prefersReducedMotion, projectionBasis, projectionNote } from './campaign-insights'
import { CampaignListsStrip } from './campaign-lists-strip'
import { CampaignTrendChart } from './campaign-trend-chart'

type Insights = CampaignInsights
type Range = { low: number; high: number }

const todayKey = () => new Date().toISOString().slice(0, 10)

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const percentOf = (value: number, max: number) => `${(value / max) * 100}%`

const RangeRow = ({ label, range, max }: { label: string; range: Range; max: number }) => (
   <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2 text-sm">
         <span className="font-medium">{label}</span>
         <span className="tabular-nums">
            {range.low} to {range.high} invites
         </span>
      </div>
      <div className="bg-muted relative h-2 rounded-full">
         <div
            className="bg-primary absolute inset-y-0 rounded-full"
            style={{ left: percentOf(range.low, max), width: percentOf(range.high - range.low, max) }}
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
   // Both ranges share one scale so the 7-day and 30-day bars compare.
   const max = Math.max(projection.next30.high, 1)
   return (
      <Card>
         <CardHeader>
            {title}
            <CardDescription>At this pace, not a forecast. {projectionBasis(projection.basis)}</CardDescription>
         </CardHeader>
         <CardContent className="grid gap-4">
            <RangeRow label="Next 7 days" range={projection.next7} max={max} />
            <RangeRow label="Next 30 days" range={projection.next30} max={max} />
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
   period,
   campaignLabel,
}: {
   insights: Insights
   period: CampaignPeriod
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
         {period !== 'today' && <CampaignTrendChart key={period} history={insights.history} animate={animate} />}
         <ProjectionBlock insights={insights} />
         <CampaignListsStrip lists={insights.lists} campaignLabel={campaignLabel} />
      </section>
   )
}
