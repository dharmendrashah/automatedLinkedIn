import { Button } from '@/components/ui/button'
import { GoLive } from '@/components/campaigns/go-live'
import { Checkbox } from '@/components/ui/checkbox'
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { readableError } from '@/lib/trpc-error'
import {
   CAMPAIGN_PERIODS,
   type CampaignPeriod,
   HEALTH_WORDS,
   STAGE_LABELS,
   isSmallSample,
   rateOf,
} from '@automatedLinkedIn/contracts'
import { Suspense, lazy, useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { trpc } from '../trpc'

// The insights panel carries recharts, so it loads with its own chunk.
const CampaignInsightsPanel = lazy(() =>
   import('@/components/campaigns/campaign-insights-panel').then(({ CampaignInsightsPanel: panel }) => ({ default: panel }))
)
const PERIOD_LABELS: Record<CampaignPeriod, string> = {
   today: 'Today',
   '7d': '7 days',
   '30d': '30 days',
}

const HEALTH_LABELS: Record<(typeof HEALTH_WORDS)[number], string> = {
   HEALTHY: 'Healthy',
   WARNING: 'Warning',
   PAUSED: 'Paused',
}

const percent = (part: number, whole: number) => {
   const rate = rateOf(part, whole)

   return rate === null ? 'no data' : `${Math.round(rate * 100)} %`
}

// "34 % with, 27 % control (small sample)".
const Compare = ({ label, one, two }: { label: string; one: Group; two: Group }) => (
   <p className="text-sm">
      <span className="font-medium">{label}: </span>
      {`${percent(one.accepted, one.invited)} ${one.name} (${one.invited} people), ${percent(two.accepted, two.invited)} ${two.name} (${two.invited} people)`}
      {isSmallSample(Math.min(one.invited, two.invited)) ? (
         <span className="text-muted-foreground"> Small sample, do not trust it yet.</span>
      ) : null}
   </p>
)

type Group = { name: string; invited: number; accepted: number }

// The morning screen of a campaign (.plan/lead-pipeline-p5-campaign-page.md): what needs the owner, what the campaign did, and how the
// accounts are.
export const Campaign = () => {
   const { id = '' } = useParams()
   const utils = trpc.useUtils()
   const [period, setPeriod] = useState<CampaignPeriod>('7d')
   const [pausing, setPausing] = useState(false)
   const [stopQueued, setStopQueued] = useState(false)
   const [line, setLine] = useState(60)
   const page = trpc.campaign.overview.useQuery({ id, period }, { retry: false })
   // The trend has no Today view, so the query is off there and the period sent is a placeholder.
   const insights = trpc.campaign.insights.useQuery(
      { id, period: period === 'today' ? '7d' : period },
      { enabled: period !== 'today', retry: false }
   )
   const refresh = () => utils.campaign.overview.invalidate({ id })
   const pause = trpc.campaign.pause.useMutation({
      onSuccess: async () => {
         setPausing(false)
         await refresh()
      },
      onError: error => toast.error(readableError(error)),
   })
   const resume = trpc.campaign.resume.useMutation({
      onSuccess: refresh,
      onError: error => toast.error(readableError(error)),
   })

   if (page.isPending) {
      return <Skeleton className="m-4 h-40 w-full rounded-xl lg:m-6" />
   }

   if (!page.data) {
      return <p className="text-destructive px-4 text-sm lg:px-6">{page.error?.message ?? 'Campaign not found'}</p>
   }

   const { campaign, lastDiscoverRun, funnel, cuts, warmUp, histogram, needsYou, accounts, workflows } = page.data
   const paused = campaign.pausedAt !== null
   const steps = [
      ['Found', funnel.found],
      ['Qualified', funnel.qualified],
      ['Invited', funnel.invited],
      ['Accepted', funnel.accepted],
      ['Messaged', funnel.messaged],
      ['Replied', funnel.replied],
      ['Silent', funnel.silent],
      ['Handed over', funnel.handedOver],
   ] as const
   const passing = histogram.slice(Math.floor(line / 10)).reduce((sum, count) => sum + count, 0)
   const filters = encodeURIComponent(JSON.stringify({ labels: [campaign.label] }))

   const renderInsights = () => {
      if (period === 'today') return null
      if (insights.isPending) return <Skeleton className="h-64 w-full rounded-xl" />
      if (insights.error) return <p className="text-destructive text-sm">{insights.error.message}</p>
      return insights.data ? (
         <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
            <CampaignInsightsPanel insights={insights.data} period={period} campaignLabel={campaign.label} />
         </Suspense>
      ) : null
   }

   return (
      <div className="grid w-full gap-4 px-4 lg:px-6">
         <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
               <h2 className="text-lg font-semibold">{`Campaign: ${campaign.name}`}</h2>
               <Link className="text-muted-foreground text-xs underline" to="/campaigns">
                  All campaigns
               </Link>
            </div>
            <div className="flex flex-wrap items-center gap-3">
               <Tabs value={period} onValueChange={next => setPeriod(next as CampaignPeriod)}>
                  <TabsList>
                     {CAMPAIGN_PERIODS.map(each => (
                        <TabsTrigger key={each} value={each}>
                           {PERIOD_LABELS[each]}
                        </TabsTrigger>
                     ))}
                  </TabsList>
               </Tabs>
               {paused ? (
                  <Button disabled={resume.isPending} onClick={() => resume.mutate({ id })}>
                     Paused. Resume
                  </Button>
               ) : (
                  <Button variant="outline" onClick={() => setPausing(true)}>
                     Pause everything
                  </Button>
               )}
            </div>
         </div>

         {renderInsights()}

         <section className="grid gap-2 rounded-xl border px-4 py-3">
            <h3 className="text-sm font-medium">Needs you</h3>
            {needsYou.length === 0 ? (
               <p className="text-muted-foreground text-sm">Nothing.</p>
            ) : (
               <ul className="grid gap-1 text-sm">
                  {needsYou.map(item => (
                     <li key={`${item.kind}-${item.text}`} className="flex flex-wrap items-center gap-2">
                        <span>{item.text}</span>
                        <Button asChild size="sm" variant="outline">
                           <Link to={item.to}>Open</Link>
                        </Button>
                     </li>
                  ))}
               </ul>
            )}
         </section>

         <section className="grid gap-1 rounded-xl border px-4 py-3 text-sm">
            <h3 className="text-sm font-medium">Last Discover run</h3>
            {lastDiscoverRun === null ? (
               <p className="text-muted-foreground text-xs">Nothing yet. Discover has not run.</p>
            ) : lastDiscoverRun.finishedAt === null ? (
               <p>{`Running since ${new Date(lastDiscoverRun.startedAt).toLocaleString('en-US')}`}</p>
            ) : (
               <p>
                  {`${lastDiscoverRun.status.toLowerCase()}, finished ${new Date(lastDiscoverRun.finishedAt).toLocaleString('en-US')}: ${lastDiscoverRun.qualified} qualified, ${lastDiscoverRun.maybe} maybe.${lastDiscoverRun.message ? ` ${lastDiscoverRun.message}` : ''}`}
               </p>
            )}
         </section>

         <section className="grid gap-2 rounded-xl border px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
               {steps.map(([label, count], at) => (
                  <span key={label} className="flex items-center gap-2">
                     {at > 0 ? <span className="text-muted-foreground">{'\u2192'}</span> : null}
                     <span>
                        {label} <span className="font-semibold">{count}</span>
                     </span>
                  </span>
               ))}
            </div>
            {period === 'today' && funnel.found === 0 && funnel.invited === 0 && lastDiscoverRun === null ? (
               <p className="text-muted-foreground text-xs">Nothing yet. Invites start after Discover runs.</p>
            ) : null}
            <Compare
               label="Notes"
               one={{ name: 'with a note', ...(cuts.byNote.find(cut => cut.key === 'with') ?? { invited: 0, accepted: 0 }) }}
               two={{ name: 'without', ...(cuts.byNote.find(cut => cut.key === 'without') ?? { invited: 0, accepted: 0 }) }}
            />
            <Compare
               label="Warm-up"
               one={{ name: 'with', ...warmUp.warm }}
               two={{ name: 'control', ...warmUp.control }}
            />
            <p className="text-muted-foreground text-xs">
               A person in two campaigns is counted in each. Invites count from the day the workflow joined.
            </p>
         </section>

         <section className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm">
            <span>{`Handed over in this period: ${funnel.handedOver} people`}</span>
            <Button asChild size="sm" variant="outline">
               <Link to={`/network?filters=${filters}`}>Open these people</Link>
            </Button>
         </section>

         <section className="grid gap-2 rounded-xl border px-4 py-3">
            <h3 className="text-sm font-medium">Who accepts</h3>
            <div className="grid gap-4 md:grid-cols-2">
               <CutTable title="By fit" rows={cuts.byBand} />
               <CutTable title="By account" rows={cuts.byAccount} />
            </div>
         </section>

         <section className="grid gap-2 rounded-xl border px-4 py-3">
            <h3 className="text-sm font-medium">Scores of the people found</h3>
            <div className="flex h-16 items-end gap-1" aria-label="Scores in groups of ten">
               {histogram.map((count, bucket) => (
                  <div
                     key={bucket}
                     title={`${bucket * 10} to ${bucket * 10 + 9}: ${count}`}
                     className="bg-primary/70 w-full rounded-sm"
                     style={{ height: `${Math.max(4, (count / Math.max(...histogram, 1)) * 100)}%` }}
                  />
               ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
               <Label htmlFor="score-line">At or above</Label>
               <input
                  id="score-line"
                  type="range"
                  min={0}
                  max={90}
                  step={10}
                  value={line}
                  onChange={event => setLine(Number(event.target.value))}
               />
               <span>{`${line}: ${passing} people`}</span>
            </div>
         </section>

         <section className="grid gap-2 rounded-xl border px-4 py-3">
            <h3 className="text-sm font-medium">Accounts</h3>
            {accounts.length === 0 ? (
               <p className="text-muted-foreground text-sm">No account yet.</p>
            ) : (
               <ul className="grid gap-1 text-sm">
                  {accounts.map(account => (
                     <li key={account.accountId} className="grid gap-0.5">
                        <span>
                           <span className="font-medium">{account.name}</span>{' '}
                           {HEALTH_LABELS[account.health]}
                           {account.health === 'PAUSED' ? '' : `, invites ${account.invites.used}/${account.invites.limit} today`}
                           {`, pending ${account.pending.count.toLocaleString('en-US')} (${Math.round(account.pending.share * 100)} %)`}
                        </span>
                        {account.reasons.map(reason => (
                           <span key={reason} className="text-muted-foreground text-xs">
                              {reason}
                           </span>
                        ))}
                     </li>
                  ))}
               </ul>
            )}
         </section>

         <GoLive workflows={workflows} onChanged={() => void refresh()} />

         <section className="grid gap-2 rounded-xl border px-4 py-3">
            <h3 className="text-sm font-medium">Workflows</h3>
            {workflows.length === 0 ? (
               <p className="text-muted-foreground text-sm">
                  Add workflows to this campaign from their settings.
               </p>
            ) : (
               <ul className="grid gap-1 text-sm">
                  {workflows.map(workflow => (
                     <li key={workflow.id} className="flex flex-wrap items-center gap-2">
                        <Link className="underline" to={`/workflows/${workflow.id}`}>
                           {workflow.name}
                        </Link>
                        <span className="text-muted-foreground">
                           {`${STAGE_LABELS[workflow.stage]}, ${workflow.enabled ? 'on' : 'off'}`}
                           {workflow.lastRun ? `, last run ${workflow.lastRun.status.toLowerCase()}` : ''}
                        </span>
                     </li>
                  ))}
               </ul>
            )}
         </section>

         <Dialog open={pausing} onOpenChange={setPausing}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>{`Pause ${campaign.name}?`}</DialogTitle>
                  <DialogDescription>
                     {`This switches off its ${workflows.filter(workflow => workflow.enabled).length} workflows. What is already queued (about a day) still goes.`}
                  </DialogDescription>
               </DialogHeader>
               <div className="flex items-center gap-2">
                  <Checkbox
                     id="stop-queued"
                     checked={stopQueued}
                     onCheckedChange={next => setStopQueued(next === true)}
                  />
                  <Label htmlFor="stop-queued">Also stop queued acts, invites, drafts and messages</Label>
               </div>
               <DialogFooter>
                  <Button variant="outline" onClick={() => setPausing(false)}>
                     Cancel
                  </Button>
                  <Button disabled={pause.isPending} onClick={() => pause.mutate({ id, stopQueued })}>
                     Pause
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </div>
   )
}

const CutTable = ({ title, rows }: { title: string; rows: Array<{ key: string; label: string; invited: number; accepted: number }> }) => (
   <div className="grid gap-1 text-sm">
      <p className="font-medium">{title}</p>
      {rows.length === 0 ? <p className="text-muted-foreground">No invites yet.</p> : null}
      {rows.map(row => (
         <p key={row.key}>
            {`${row.label}: ${percent(row.accepted, row.invited)} accepted of ${row.invited}`}
            {isSmallSample(row.invited) ? <span className="text-muted-foreground"> (small sample)</span> : null}
         </p>
      ))}
   </div>
)
