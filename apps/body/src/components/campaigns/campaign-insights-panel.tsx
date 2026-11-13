import type { CampaignInsights, CampaignPeriod } from '@automatedLinkedIn/contracts'

import { CampaignCapacity } from './campaign-capacity'
import { prefersReducedMotion, projectionBasis, projectionNote } from './campaign-insights'
import { CampaignListsStrip } from './campaign-lists-strip'
import { CampaignTrendChart } from './campaign-trend-chart'

type Insights = CampaignInsights
type Range = { low: number; high: number }

const todayKey = () => new Date().toISOString().slice(0, 10)

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const Figure = ({ label, value }: { label: string; value: string | number }) => (
   <div className="grid gap-1">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
   </div>
)

const ProjectionBlock = ({ insights }: { insights: Insights }) => {
   const { projection, gate } = insights
   if (projection.status === 'hidden') {
      return <p className="text-muted-foreground text-sm">{projectionNote(projection, gate)}</p>
   }
   const range = (value: Range) => `${value.low} to ${value.high} invites`
   return (
      <div className="grid gap-3">
         <div className="grid grid-cols-2 gap-4">
            <Figure label="Next 7 days" value={range(projection.next7)} />
            <Figure label="Next 30 days" value={range(projection.next30)} />
         </div>
         <p className="text-muted-foreground text-sm">
            At this pace, not a forecast. {projectionBasis(projection.basis)}
         </p>
      </div>
   )
}

const TrendSummary = ({ insights }: { insights: Insights }) => {
   const { totals, since, updatedAt, history } = insights
   const last = history.at(-1)
   const soFar = last?.day === todayKey()
   const skipped = totals.skippedDays
   return (
      <div className="grid gap-3">
         <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Figure label="Found" value={totals.found} />
            <Figure label="Qualified" value={totals.qualified} />
            <Figure label="Invited" value={totals.invited} />
            <Figure label="Accepted" value={totals.accepted} />
         </div>
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
   if (insights.state === 'empty') {
      return (
         <section className="grid gap-4 rounded-xl border p-4">
            <h2 className="text-base font-semibold">What your accounts can reach</h2>
            <CampaignCapacity capacity={insights.capacity} />
         </section>
      )
   }
   const animate = !prefersReducedMotion()
   return (
      <section className="grid gap-4 rounded-xl border p-4">
         {insights.state === 'tooEarly' ? (
            <h2 className="text-base font-semibold">Too early to judge</h2>
         ) : (
            <TrendSummary insights={insights} />
         )}
         {period !== 'today' && <CampaignTrendChart key={period} history={insights.history} animate={animate} />}
         <ProjectionBlock insights={insights} />
         <CampaignListsStrip lists={insights.lists} campaignLabel={campaignLabel} />
      </section>
   )
}
