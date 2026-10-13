import { floatingDrawer } from '@/components/floating-drawer'
import { RadioMark } from '@/components/radio-mark'
import { SectionLabel, TextBlock } from '@/components/text-block'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
   Drawer,
   DrawerClose,
   DrawerContent,
   DrawerDescription,
   DrawerFooter,
   DrawerHeader,
   DrawerTitle,
} from '@/components/ui/drawer'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { timeAgo } from '@/lib/time-ago'
import { tone } from '@/lib/tone'
import { History, Loader2, RefreshCw } from 'lucide-react'
import { useState } from 'react'

import { ScoreHistory } from './score-history'

import { cn } from '@/lib/utils'

import { type Proxy, type ProxyHandlers, type ProxyTestEntry } from './types'

import { trpc } from '../../trpc'
import { CheckChip } from './check-chip'
import { checksOf } from './checks'
import { formatBody, formatHeaders } from './format'
import { issueInfo, levelInfo } from './health'
import { HealthBadge } from './health-badge'
import { describeLatency, speedClass } from './latency'
import { ProxyStatusBadge } from './proxy-status-badge'
import { SuggestionPanel } from './suggestion-panel'

const formatTime = (value: string | Date) =>
   new Date(value).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'medium',
   })

const Detail = ({ entry }: { entry: ProxyTestEntry }) => (
   <Tabs defaultValue="response" className="gap-4">
      <TabsList className="w-full">
         <TabsTrigger value="request">Request</TabsTrigger>
         <TabsTrigger value="response">Response</TabsTrigger>
      </TabsList>

      <TabsContent value="request" className="grid gap-4">
         <TextBlock title="Request">{`${entry.requestMethod} ${entry.requestUrl}`}</TextBlock>
         <TextBlock title="Headers">{formatHeaders(entry.requestHeaders)}</TextBlock>
         <TextBlock title="Body">{formatBody(entry.requestBody, false)}</TextBlock>
      </TabsContent>

      <TabsContent value="response" className="grid gap-4">
         {entry.responseStatus === null ? (
            <TextBlock title="Result">{entry.error ?? 'No response arrived.'}</TextBlock>
         ) : (
            <>
               <TextBlock title="Status">{String(entry.responseStatus)}</TextBlock>
               <TextBlock title="Headers">{formatHeaders(entry.responseHeaders)}</TextBlock>
               <TextBlock title="Body">{formatBody(entry.responseBody, entry.responseTruncated)}</TextBlock>
            </>
         )}
      </TabsContent>
   </Tabs>
)

// The raw tests, for someone who wants to see exactly what was sent and what came back.
const TechnicalTests = ({ proxy }: { proxy: Proxy }) => {
   const [picked, setPicked] = useState<string | null>(null)
   const history = trpc.proxyServer.history.useQuery({ id: proxy.id }, { retry: false })

   // Newest first, so the latest test is the one shown until another is picked.
   const selectedId = picked ?? history.data?.[0]?.id
   const entry = trpc.proxyServer.historyEntry.useQuery(
      { id: selectedId ?? '' },
      { enabled: Boolean(selectedId), retry: false }
   )

   return (
      <>
         <p className="text-muted-foreground text-sm">
            For the technically minded: each test we ran through this proxy, with exactly what was sent and what came
            back. Kept for 7 days.
         </p>
         {history.isPending ? (
            <div className="grid gap-2">
               <Skeleton className="h-16 w-full rounded-xl" />
               <Skeleton className="h-16 w-full rounded-xl" />
            </div>
         ) : null}
         {history.error ? <p className="text-destructive text-sm">{history.error.message}</p> : null}
         {history.data?.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
               <span className="bg-muted text-muted-foreground grid size-10 place-items-center rounded-full">
                  <History className="size-5" aria-hidden />
               </span>
               <p className="text-sm font-medium">No tests in the last 7 days</p>
               <p className="text-muted-foreground text-sm">Use Test again to run one.</p>
            </div>
         ) : null}

         {history.data && history.data.length > 0 ? (
            <section className="grid gap-2">
               <SectionLabel>{`Tests (${history.data.length})`}</SectionLabel>
               <ul className="-mx-1 grid max-h-64 gap-2 overflow-y-auto px-1 py-1" aria-label="Tests">
                  {history.data.map((test, index) => {
                     const selected = test.id === selectedId
                     const latency = describeLatency(test.latencyMs)

                     return (
                        <li key={test.id}>
                           <button
                              type="button"
                              onClick={() => setPicked(test.id)}
                              aria-pressed={selected}
                              className={cn(
                                 'bg-card hover:bg-muted/60 focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors outline-none focus-visible:ring-[3px]',
                                 selected && 'border-primary/60 bg-muted/60 ring-primary/20 ring-1'
                              )}
                           >
                              <div className="grid min-w-0 flex-1 gap-1.5">
                                 <span className="flex items-center gap-2 text-sm font-medium">
                                    {formatTime(test.testedAt)}
                                    {index === 0 ? <Badge variant="secondary">Latest</Badge> : null}
                                 </span>
                                 <span className="flex flex-wrap items-center gap-1.5">
                                    <ProxyStatusBadge status={test.status} message={null} />
                                    {test.responseStatus ? (
                                       <Badge variant="outline">HTTP {test.responseStatus}</Badge>
                                    ) : null}
                                 </span>
                              </div>
                              <span
                                 className={cn(
                                    'text-sm font-medium tabular-nums',
                                    latency ? speedClass[latency.speed] : 'text-muted-foreground'
                                 )}
                              >
                                 {latency?.text ?? '—'}
                              </span>
                              <RadioMark checked={selected} />
                           </button>
                        </li>
                     )
                  })}
               </ul>
            </section>
         ) : null}

         {selectedId ? (
            <section className="grid gap-3">
               <div className="flex items-center justify-between">
                  <SectionLabel>Details</SectionLabel>
                  {entry.isFetching ? <Loader2 className="text-muted-foreground size-4 animate-spin" /> : null}
               </div>
               {entry.error ? <p className="text-destructive text-sm">{entry.error.message}</p> : null}
               {entry.data ? <Detail entry={entry.data} /> : null}
               {!entry.data && !entry.error ? <Skeleton className="h-40 w-full rounded-xl" /> : null}
            </section>
         ) : null}
      </>
   )
}

// The plain-language report: how it is doing, each check with what it is for, every problem explained, and the facts.
const HealthReport = ({ proxy, siblings, handlers }: { proxy: Proxy; siblings: Proxy[]; handlers: ProxyHandlers }) => {
   const info = levelInfo[proxy.health.level]

   return (
      <>
         <section className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
               <HealthBadge level={proxy.health.level} />
               {proxy.isBest ? (
                  <Badge variant="outline" className={tone.info.badge}>
                     In use
                  </Badge>
               ) : null}
            </div>
            <p className="text-sm leading-relaxed">{info.explanation}</p>
            <SuggestionPanel proxy={proxy} siblings={siblings} handlers={handlers} />
         </section>

         <section className="grid gap-2">
            <SectionLabel>What we checked</SectionLabel>
            <div className="grid gap-2">
               {checksOf(proxy, siblings.length).map(check => (
                  <CheckChip key={check.key} check={check} showAbout />
               ))}
            </div>
         </section>

         {proxy.health.issues.length > 0 ? (
            <section className="grid gap-2">
               <SectionLabel>What is not ideal</SectionLabel>
               <ul className="grid gap-3">
                  {proxy.health.issues.map(issue => (
                     <li key={issue} className="grid gap-0.5 text-sm">
                        <span className="font-medium">
                           {issueInfo[issue].title}
                           {proxy.health.open.includes(issue) ? '' : ' (accepted)'}
                        </span>
                        <span className="text-muted-foreground leading-relaxed">{issueInfo[issue].because(proxy)}</span>
                     </li>
                  ))}
               </ul>
            </section>
         ) : null}

         <section className="grid gap-2">
            <SectionLabel>About this proxy</SectionLabel>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
               <dt className="text-muted-foreground">LinkedIn account</dt>
               <dd>{proxy.linkedInAccount.email}</dd>
               <dt className="text-muted-foreground">Address</dt>
               <dd className="font-mono break-all">
                  {proxy.protocol.toLowerCase()}://{proxy.host}:{proxy.port}
               </dd>
               <dt className="text-muted-foreground">Seen from</dt>
               <dd className="font-mono break-all">{proxy.detectedIp ?? 'Not known yet'}</dd>
               <dt className="text-muted-foreground">Last tested</dt>
               <dd>
                  {proxy.lastTestedAt ? `${timeAgo(proxy.lastTestedAt)} (${formatTime(proxy.lastTestedAt)})` : 'Never'}
               </dd>
               <dt className="text-muted-foreground">Score</dt>
               <dd>{proxy.score === null ? 'Not scored yet' : `${proxy.score} of 100 (higher is better)`}</dd>
            </dl>
         </section>
      </>
   )
}

type Props = {
   proxy: Proxy | null
   siblings: Proxy[]
   handlers: ProxyHandlers
   onClose: () => void
}

export const ProxyDetailsDrawer = ({ proxy, siblings, handlers, onClose }: Props) => {
   const testing = Boolean(proxy) && handlers.busyId === proxy?.id

   return (
      <Drawer open={Boolean(proxy)} onOpenChange={open => (open ? undefined : onClose())} direction="right">
         <DrawerContent className={floatingDrawer('data-[vaul-drawer-direction=right]:sm:max-w-xl')}>
            <DrawerHeader className="flex-row items-start justify-between gap-3 border-b px-5 py-4">
               <div className="grid gap-1.5">
                  <DrawerTitle className="text-base">Full report</DrawerTitle>
                  <DrawerDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
                     {proxy ? (
                        <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
                           {`${proxy.protocol.toLowerCase()}://${proxy.host}:${proxy.port}`}
                        </code>
                     ) : null}
                     <span>{proxy ? proxy.linkedInAccount.email : ''}</span>
                  </DrawerDescription>
               </div>
               <Button size="sm" onClick={() => proxy && handlers.onTest(proxy)} disabled={testing || !proxy}>
                  {testing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  {testing ? 'Testing' : 'Test again'}
               </Button>
            </DrawerHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
               {proxy ? (
                  <Tabs defaultValue="report" className="gap-6" key={proxy.id}>
                     <TabsList className="w-full">
                        <TabsTrigger value="report">Health report</TabsTrigger>
                        <TabsTrigger value="reputation">Reputation</TabsTrigger>
                        <TabsTrigger value="tests">Technical tests</TabsTrigger>
                     </TabsList>

                     <TabsContent value="report" className="grid gap-6">
                        <HealthReport proxy={proxy} siblings={siblings} handlers={handlers} />
                     </TabsContent>
                     <TabsContent value="reputation" className="grid gap-6">
                        <ScoreHistory proxy={proxy} />
                     </TabsContent>
                     <TabsContent value="tests" className="grid gap-6">
                        <TechnicalTests proxy={proxy} />
                     </TabsContent>
                  </Tabs>
               ) : null}
            </div>

            <DrawerFooter className="border-t px-5 py-4">
               <DrawerClose asChild>
                  <Button variant="outline">Close</Button>
               </DrawerClose>
            </DrawerFooter>
         </DrawerContent>
      </Drawer>
   )
}
