import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
   Drawer,
   DrawerClose,
   DrawerContent,
   DrawerDescription,
   DrawerHeader,
   DrawerTitle,
} from '@/components/ui/drawer'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, X } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

import { type Proxy, type ProxyTestEntry } from './types'

import { trpc } from '../../trpc'
import { formatBody, formatHeaders } from './format'
import { ProxyStatusBadge } from './proxy-status-badge'

// Bodies come from the proxy, so they are text in a <pre>, never HTML.
const Block = ({ title, children }: { title: string; children: string }) => (
   <section className="grid gap-1">
      <h4 className="text-muted-foreground text-xs font-medium uppercase">{title}</h4>
      <pre className="bg-muted max-h-72 overflow-auto rounded-md p-3 font-mono text-xs break-all whitespace-pre-wrap">
         {children}
      </pre>
   </section>
)

const Detail = ({ entry }: { entry: ProxyTestEntry }) => (
   <Tabs defaultValue="response" className="grid gap-3">
      <TabsList>
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

type Props = {
   proxy: Proxy | null
   onClose: () => void
}

export const TestHistoryDrawer = ({ proxy, onClose }: Props) => {
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

   return (
      <Drawer open={Boolean(proxy)} onOpenChange={open => (open ? undefined : close())} direction="right">
         <DrawerContent className="data-[vaul-drawer-direction=right]:sm:max-w-2xl">
            <DrawerHeader className="flex-row items-start justify-between gap-2">
               <div className="grid gap-1">
                  <DrawerTitle>Test history</DrawerTitle>
                  <DrawerDescription>
                     {proxy ? `${proxy.protocol.toLowerCase()}://${proxy.host}:${proxy.port}` : ''} — the last 7 days
                  </DrawerDescription>
               </div>
               <DrawerClose asChild>
                  <Button variant="ghost" size="icon" aria-label="Close">
                     <X />
                  </Button>
               </DrawerClose>
            </DrawerHeader>

            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-4 pb-4">
               {history.isPending && proxy ? <Skeleton className="h-24 w-full" /> : null}
               {history.error ? <p className="text-destructive text-sm">{history.error.message}</p> : null}
               {history.data?.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No tests in the last 7 days. Use Test now to run one.</p>
               ) : null}

               {history.data && history.data.length > 0 ? (
                  <ul className="grid max-h-48 gap-1 overflow-y-auto" aria-label="Tests">
                     {history.data.map(test => (
                        <li key={test.id}>
                           <button
                              type="button"
                              onClick={() => setPicked(test.id)}
                              aria-pressed={test.id === selectedId}
                              className={cn(
                                 'hover:bg-muted flex w-full flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-left text-sm',
                                 test.id === selectedId && 'border-primary bg-muted'
                              )}
                           >
                              <span className="font-medium">{new Date(test.testedAt).toLocaleString()}</span>
                              <ProxyStatusBadge status={test.status} message={null} />
                              {test.responseStatus ? <Badge variant="outline">HTTP {test.responseStatus}</Badge> : null}
                              <span className="text-muted-foreground ml-auto">
                                 {test.latencyMs === null ? '—' : `${test.latencyMs} ms`}
                              </span>
                           </button>
                        </li>
                     ))}
                  </ul>
               ) : null}

               {entry.isFetching && selectedId ? <Loader2 className="size-4 animate-spin" /> : null}
               {entry.error ? <p className="text-destructive text-sm">{entry.error.message}</p> : null}
               {entry.data ? <Detail entry={entry.data} /> : null}
            </div>
         </DrawerContent>
      </Drawer>
   )
}
