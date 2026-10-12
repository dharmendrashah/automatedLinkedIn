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
import { History, Loader2, RefreshCw } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

import { type Proxy, type ProxyTestEntry } from './types'

import { trpc } from '../../trpc'
import { formatBody, formatHeaders } from './format'
import { describeLatency, speedClass } from './latency'
import { ProxyStatusBadge } from './proxy-status-badge'

const formatTime = (value: string | Date) =>
   new Date(value).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'medium',
   })

const SectionLabel = ({ children }: { children: string }) => (
   <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{children}</h3>
)

// Bodies come from the proxy, so they are text in a <pre>, never HTML.
const Block = ({ title, children }: { title: string; children: string }) => (
   <section className="grid gap-1.5">
      <SectionLabel>{title}</SectionLabel>
      <pre className="bg-muted/40 max-h-64 overflow-auto rounded-lg border p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
         {children}
      </pre>
   </section>
)

const Detail = ({ entry }: { entry: ProxyTestEntry }) => (
   <Tabs defaultValue="response" className="gap-4">
      <TabsList className="w-full">
         <TabsTrigger value="request">Request</TabsTrigger>
         <TabsTrigger value="response">Response</TabsTrigger>
      </TabsList>

      <TabsContent value="request" className="grid gap-4">
         <Block title="Request">{`${entry.requestMethod} ${entry.requestUrl}`}</Block>
         <Block title="Headers">{formatHeaders(entry.requestHeaders)}</Block>
         <Block title="Body">{formatBody(entry.requestBody, false)}</Block>
      </TabsContent>

      <TabsContent value="response" className="grid gap-4">
         {entry.responseStatus === null ? (
            <Block title="Result">{entry.error ?? 'No response arrived.'}</Block>
         ) : (
            <>
               <Block title="Status">{String(entry.responseStatus)}</Block>
               <Block title="Headers">{formatHeaders(entry.responseHeaders)}</Block>
               <Block title="Body">{formatBody(entry.responseBody, entry.responseTruncated)}</Block>
            </>
         )}
      </TabsContent>
   </Tabs>
)

const Radio = ({ checked }: { checked: boolean }) => (
   <span
      aria-hidden
      className={cn(
         'grid size-4 shrink-0 place-items-center rounded-full border transition-colors',
         checked ? 'border-primary' : 'border-muted-foreground/30'
      )}
   >
      {checked ? <span className="bg-primary size-2 rounded-full" /> : null}
   </span>
)

type Props = {
   proxy: Proxy | null
   testing: boolean
   onTest: (proxy: Proxy) => void
   onClose: () => void
}

export const TestHistoryDrawer = ({ proxy, testing, onTest, onClose }: Props) => {
   const [picked, setPicked] = useState<string | null>(null)
   const history = trpc.proxyServer.history.useQuery({ id: proxy?.id ?? '' }, { enabled: Boolean(proxy), retry: false })

   // Newest first, so the latest test is the one shown until another is picked.
   const selectedId = picked ?? history.data?.[0]?.id
   const entry = trpc.proxyServer.historyEntry.useQuery(
      { id: selectedId ?? '' },
      { enabled: Boolean(proxy && selectedId), retry: false }
   )

   const close = () => {
      setPicked(null)
      onClose()
   }

   const runTest = () => {
      if (!proxy) return

      // Show the new test as soon as it lands, not the one picked before.
      setPicked(null)
      onTest(proxy)
   }

   return (
      <Drawer open={Boolean(proxy)} onOpenChange={open => (open ? undefined : close())} direction="right">
         <DrawerContent
            className={cn(
               'data-[vaul-drawer-direction=right]:inset-y-3 data-[vaul-drawer-direction=right]:right-3',
               'data-[vaul-drawer-direction=right]:w-[calc(100%-1.5rem)] data-[vaul-drawer-direction=right]:sm:max-w-xl',
               'data-[vaul-drawer-direction=right]:rounded-2xl data-[vaul-drawer-direction=right]:border shadow-2xl'
            )}
         >
            <DrawerHeader className="flex-row items-start justify-between gap-3 border-b px-5 py-4">
               <div className="grid gap-1.5">
                  <DrawerTitle className="text-base">Test history</DrawerTitle>
                  <DrawerDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
                     {proxy ? (
                        <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
                           {`${proxy.protocol.toLowerCase()}://${proxy.host}:${proxy.port}`}
                        </code>
                     ) : null}
                     <span>Kept for 7 days</span>
                  </DrawerDescription>
               </div>
               <Button size="sm" onClick={runTest} disabled={testing || !proxy}>
                  {testing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  {testing ? 'Testing' : 'Test now'}
               </Button>
            </DrawerHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
               {history.isPending && proxy ? (
                  <div className="grid gap-2">
                     <Skeleton className="h-16 w-full rounded-xl" />
                     <Skeleton className="h-16 w-full rounded-xl" />
                  </div>
               ) : null}
               {history.error ? <p className="text-destructive text-sm">{history.error.message}</p> : null}
               {history.data?.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
                     <span className="bg-muted text-muted-foreground grid size-10 place-items-center rounded-full">
                        <History className="size-5" />
                     </span>
                     <p className="text-sm font-medium">No tests in the last 7 days</p>
                     <p className="text-muted-foreground text-sm">Use Test now on this proxy to run one.</p>
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
                                    <Radio checked={selected} />
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
