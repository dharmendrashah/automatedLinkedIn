import { CampaignFunnel } from '@/components/campaigns/campaign-funnel'
import { CampaignSummaryTiles } from '@/components/campaigns/campaign-summary-tiles'
import { GoLive } from '@/components/campaigns/go-live'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { readableError } from '@/lib/trpc-error'
import { keepPreviousData } from '@tanstack/react-query'
import { ArrowLeft, LayoutDashboard, Pause, Play, UserRound, Users, Workflow } from 'lucide-react'
import { Suspense, lazy, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import {
   CAMPAIGN_PERIODS,
   type CampaignPeriod,
   type CampaignTrendPeriod,
   HEALTH_WORDS,
   STAGE_LABELS,
   isSmallSample,
   rateOf,
} from '@automatedLinkedIn/contracts'

import { trpc } from '../trpc'

// The insights panel and the histogram carry recharts, so they load with their own chunk.
const CampaignInsightsPanel = lazy(() =>
   import('@/components/campaigns/campaign-insights-panel').then(({ CampaignInsightsPanel: panel }) => ({
      default: panel,
   }))
)
const ScoresHistogram = lazy(() =>
   import('@/components/campaigns/scores-histogram').then(({ ScoresHistogram: histogramChart }) => ({
      default: histogramChart,
   }))
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

const HEALTH_VARIANTS: Record<(typeof HEALTH_WORDS)[number], 'default' | 'destructive' | 'secondary'> = {
   HEALTHY: 'default',
   WARNING: 'destructive',
   PAUSED: 'secondary',
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

const TABS = [
   { value: 'overview', label: 'Overview', icon: LayoutDashboard },
   { value: 'people', label: 'People', icon: UserRound },
   { value: 'accounts', label: 'Accounts', icon: Users },
   { value: 'workflows', label: 'Workflows', icon: Workflow },
] as const

type CampaignTab = (typeof TABS)[number]['value']

// Tabs only when the trend is there to read; otherwise every section stacks on one page.
const TabPanel = ({ value, tabbed, children }: { value: CampaignTab; tabbed: boolean; children: React.ReactNode }) =>
   tabbed ? (
      <TabsContent value={value} className="grid gap-4">
         {children}
      </TabsContent>
   ) : (
      <div className="grid gap-4">{children}</div>
   )

// The morning screen of a campaign (.plan/lead-pipeline-p5-campaign-page.md): what needs the owner, what the campaign did, and how the
// accounts are.
export const Campaign = () => {
   const { id = '' } = useParams()
   const utils = trpc.useUtils()
   const [period, setPeriod] = useState<CampaignPeriod>('7d')
   const [trendPeriod, setTrendPeriod] = useState<CampaignTrendPeriod>('7d')
   const [pausing, setPausing] = useState(false)
   const [stopQueued, setStopQueued] = useState(false)
   const [line, setLine] = useState(60)
   const [params, setParams] = useSearchParams()
   const requestedTab = params.get('tab')
   const tab = TABS.find(each => each.value === requestedTab)?.value ?? 'overview'
   const setTab = (next: string) =>
      setParams(
         prev => {
            const copy = new URLSearchParams(prev)
            copy.set('tab', next)
            return copy
         },
         { replace: true }
      )
   const page = trpc.campaign.overview.useQuery({ id, period }, { retry: false })
   // The trend has no Today view, so the query is off there and the period sent is a placeholder.
   const insights = trpc.campaign.insights.useQuery(
      { id, period: period === 'today' ? '7d' : period },
      { enabled: period !== 'today', retry: false }
   )
   // The trend card has its own 7 days / 30 days / All time toggle, so it keeps its own query.
   const trend = trpc.campaign.insights.useQuery(
      { id, period: trendPeriod },
      { enabled: period !== 'today', placeholderData: keepPreviousData, retry: false }
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
   const passing = histogram.slice(Math.floor(line / 10)).reduce((sum, count) => sum + count, 0)
   const filters = encodeURIComponent(JSON.stringify({ labels: [campaign.label] }))
   const tabbed = period !== 'today' && insights.data !== undefined && insights.data.state !== 'empty'

   const renderInsights = () => {
      if (period === 'today') return null
      if (insights.isPending) return <Skeleton className="h-64 w-full rounded-xl" />
      if (insights.error) return <p className="text-destructive text-sm">{insights.error.message}</p>
      return insights.data ? (
         <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
            <CampaignInsightsPanel
               insights={insights.data}
               trend={{ history: trend.data?.history, period: trendPeriod, onPeriodChange: setTrendPeriod }}
               campaignLabel={campaign.label}
            />
         </Suspense>
      ) : null
   }

   return (
      <div className="grid w-full gap-4 px-4 lg:px-6">
         <Card>
            <CardHeader>
               <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={paused ? 'secondary' : 'default'}>
                     {paused ? <Pause aria-hidden /> : <Play aria-hidden />}
                     {paused ? 'Paused' : 'Running'}
                  </Badge>
                  <Link
                     className="text-muted-foreground inline-flex items-center gap-1 text-xs underline"
                     to="/campaigns"
                  >
                     <ArrowLeft aria-hidden className="size-3" />
                     All campaigns
                  </Link>
               </div>
               <CardTitle className="text-lg">{campaign.name}</CardTitle>
               <CardDescription>Campaign: {campaign.label}</CardDescription>
               <CardAction className="flex flex-wrap items-center gap-3">
                  <ToggleGroup
                     type="single"
                     variant="outline"
                     value={period}
                     aria-label="Period"
                     onValueChange={next => {
                        if (next) setPeriod(next as CampaignPeriod)
                     }}
                  >
                     {CAMPAIGN_PERIODS.map(each => (
                        <ToggleGroupItem key={each} value={each} aria-label={PERIOD_LABELS[each]}>
                           {PERIOD_LABELS[each]}
                        </ToggleGroupItem>
                     ))}
                  </ToggleGroup>
                  {paused ? (
                     <Button disabled={resume.isPending} onClick={() => resume.mutate({ id })}>
                        <Play aria-hidden />
                        Resume
                     </Button>
                  ) : (
                     <Button variant="outline" onClick={() => setPausing(true)}>
                        <Pause aria-hidden />
                        Pause everything
                     </Button>
                  )}
               </CardAction>
            </CardHeader>
         </Card>

         <CampaignSummaryTiles funnel={funnel} history={insights.data?.history} />

         <Tabs value={tab} onValueChange={setTab} className="grid gap-4">
            {tabbed ? (
               <TabsList className="w-full justify-start overflow-x-auto">
                  {TABS.map(({ value, label, icon: Icon }) => (
                     <TabsTrigger key={value} value={value}>
                        <Icon aria-hidden />
                        {label}
                     </TabsTrigger>
                  ))}
               </TabsList>
            ) : null}

            <TabPanel value="overview" tabbed={tabbed}>
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

               {renderInsights()}

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
            </TabPanel>

            <TabPanel value="people" tabbed={tabbed}>
               <section className="grid gap-2 rounded-xl border px-4 py-3">
                  <CampaignFunnel funnel={funnel} />
                  {period === 'today' && funnel.found === 0 && funnel.invited === 0 && lastDiscoverRun === null ? (
                     <p className="text-muted-foreground text-xs">Nothing yet. Invites start after Discover runs.</p>
                  ) : null}
                  <Compare
                     label="Notes"
                     one={{
                        name: 'with a note',
                        ...(cuts.byNote.find(cut => cut.key === 'with') ?? { invited: 0, accepted: 0 }),
                     }}
                     two={{
                        name: 'without',
                        ...(cuts.byNote.find(cut => cut.key === 'without') ?? { invited: 0, accepted: 0 }),
                     }}
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
                  <span>Open the people handed over in this period.</span>
                  <Button asChild size="sm" variant="outline">
                     <Link to={`/network?filters=${filters}`}>Open these people</Link>
                  </Button>
               </section>

               <Card>
                  <CardHeader>
                     <CardTitle>Who accepts</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-6 md:grid-cols-2">
                     <CutTable title="By fit" rows={cuts.byBand} />
                     <CutTable title="By account" rows={cuts.byAccount} />
                  </CardContent>
               </Card>

               <Suspense fallback={<Skeleton className="h-48 w-full" />}>
                  <ScoresHistogram histogram={histogram} line={line} passing={passing} onLineChange={setLine} />
               </Suspense>
            </TabPanel>

            <TabPanel value="accounts" tabbed={tabbed}>
               <Card>
                  <CardHeader>
                     <CardTitle>Accounts</CardTitle>
                  </CardHeader>
                  <CardContent>
                     {accounts.length === 0 ? (
                        <p className="text-muted-foreground text-sm">No account yet.</p>
                     ) : (
                        <Table>
                           <TableHeader>
                              <TableRow>
                                 <TableHead>Account</TableHead>
                                 <TableHead>Health</TableHead>
                                 <TableHead>Invites today</TableHead>
                                 <TableHead>Pending</TableHead>
                              </TableRow>
                           </TableHeader>
                           <TableBody>
                              {accounts.map(account => (
                                 <TableRow key={account.accountId}>
                                    <TableCell className="font-medium">{account.name}</TableCell>
                                    <TableCell>
                                       <div className="grid gap-1">
                                          <Badge variant={HEALTH_VARIANTS[account.health]}>
                                             {HEALTH_LABELS[account.health]}
                                          </Badge>
                                          {account.reasons.map(reason => (
                                             <span key={reason} className="text-muted-foreground text-xs">
                                                {reason}
                                             </span>
                                          ))}
                                       </div>
                                    </TableCell>
                                    <TableCell>
                                       {account.health === 'PAUSED'
                                          ? 'Paused'
                                          : `${account.invites.used}/${account.invites.limit}`}
                                    </TableCell>
                                    <TableCell>
                                       {`${account.pending.count.toLocaleString('en-US')} (${Math.round(account.pending.share * 100)} %)`}
                                    </TableCell>
                                 </TableRow>
                              ))}
                           </TableBody>
                        </Table>
                     )}
                  </CardContent>
               </Card>
            </TabPanel>

            <TabPanel value="workflows" tabbed={tabbed}>
               <GoLive workflows={workflows} onChanged={() => void refresh()} />

               <Card>
                  <CardHeader>
                     <CardTitle className="flex items-center gap-2">
                        <Workflow aria-hidden className="size-4" />
                        Workflows
                     </CardTitle>
                  </CardHeader>
                  <CardContent>
                     {workflows.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                           Add workflows to this campaign from their settings.
                        </p>
                     ) : (
                        <ul className="grid gap-2 text-sm">
                           {workflows.map(workflow => (
                              <li
                                 key={workflow.id}
                                 className="bg-muted/40 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                              >
                                 <Link
                                    className="font-medium underline-offset-4 hover:underline"
                                    to={`/workflows/${workflow.id}`}
                                 >
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
                  </CardContent>
               </Card>
            </TabPanel>
         </Tabs>

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

const CutTable = ({
   title,
   rows,
}: {
   title: string
   rows: Array<{ key: string; label: string; invited: number; accepted: number }>
}) => (
   <div className="grid gap-2">
      <p className="text-sm font-medium">{title}</p>
      {rows.length === 0 ? (
         <p className="text-muted-foreground text-sm">No invites yet.</p>
      ) : (
         <Table>
            <TableHeader>
               <TableRow>
                  <TableHead>Group</TableHead>
                  <TableHead className="text-right">Accepted</TableHead>
                  <TableHead className="text-right">Invited</TableHead>
               </TableRow>
            </TableHeader>
            <TableBody>
               {rows.map(row => (
                  <TableRow key={row.key}>
                     <TableCell>{row.label}</TableCell>
                     <TableCell className="text-right">{percent(row.accepted, row.invited)}</TableCell>
                     <TableCell className="text-right">
                        {row.invited}
                        {isSmallSample(row.invited) ? (
                           <Tooltip>
                              <TooltipTrigger asChild>
                                 <Badge variant="outline" className="ml-2">
                                    small sample
                                 </Badge>
                              </TooltipTrigger>
                              <TooltipContent>Too few invites to read a rate from.</TooltipContent>
                           </Tooltip>
                        ) : null}
                     </TableCell>
                  </TableRow>
               ))}
            </TableBody>
         </Table>
      )}
   </div>
)
