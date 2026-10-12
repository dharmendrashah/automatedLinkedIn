import { Button } from '@/components/ui/button'
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { History, Loader2, MoreHorizontal, Network, Pencil, RefreshCw, ScanSearch, Trash2 } from 'lucide-react'

import { cn } from '@/lib/utils'

import { type Proxy } from './types'

import { TestButton } from '../test-button'
import { browserTestBlocker } from './browser-test'
import { describeLatency, speedClass } from './latency'
import { ProxyStatusBadge } from './proxy-status-badge'

const formatDate = (value: string | Date | null) => (value ? new Date(value).toLocaleString() : 'Never')

const LatencyCell = ({ latencyMs }: { latencyMs: number | null }) => {
   const latency = describeLatency(latencyMs)

   if (!latency) return <span className="text-muted-foreground">—</span>

   return (
      <span className={cn('font-medium', speedClass[latency.speed])} title={`${latency.speed} (last test)`}>
         {latency.text}
      </span>
   )
}

type Props = {
   proxies: Proxy[] | undefined
   loading: boolean
   error: string | undefined
   busyId: string | undefined
   // The id of the proxy a browser test was just asked for.
   testingId: string | undefined
   onEdit: (proxy: Proxy) => void
   onTest: (proxy: Proxy) => void
   // Whether the worker announced the browser test.
   browserTestAnnounced: boolean
   onBrowserTest: (proxy: Proxy) => void
   onHistory: (proxy: Proxy) => void
   onDelete: (proxy: Proxy) => void
}

export const ProxiesTable = ({
   proxies,
   loading,
   error,
   busyId,
   testingId,
   onEdit,
   onTest,
   browserTestAnnounced,
   onBrowserTest,
   onHistory,
   onDelete,
}: Props) => (
   <div className="overflow-hidden rounded-lg border">
      <Table>
         <TableHeader className="bg-muted/50">
            <TableRow>
               <TableHead>Proxy</TableHead>
               <TableHead>LinkedIn account</TableHead>
               <TableHead>Status</TableHead>
               <TableHead>Detected country</TableHead>
               <TableHead>Latency</TableHead>
               <TableHead>Last tested</TableHead>
               <TableHead className="w-48" />
            </TableRow>
         </TableHeader>
         <TableBody>
            {loading ? (
               <TableRow>
                  <TableCell colSpan={7}>
                     <Skeleton className="h-8 w-full" />
                  </TableCell>
               </TableRow>
            ) : null}
            {error ? (
               <TableRow>
                  <TableCell colSpan={7} className="text-destructive h-24 text-center text-sm">
                     {error}
                  </TableCell>
               </TableRow>
            ) : null}
            {proxies?.length === 0 ? (
               <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground h-24 text-center text-sm">
                     <Network className="mx-auto mb-2 size-5" />
                     No proxies yet. Use Add a proxy to attach one to a LinkedIn account.
                  </TableCell>
               </TableRow>
            ) : null}
            {proxies?.map(proxy => (
               <TableRow key={proxy.id}>
                  <TableCell className="font-medium">
                     {proxy.protocol.toLowerCase()}://{proxy.host}:{proxy.port}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{proxy.linkedInAccount.email}</TableCell>
                  <TableCell>
                     <ProxyStatusBadge status={proxy.status} message={proxy.statusMessage} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{proxy.detectedCountry ?? '—'}</TableCell>
                  <TableCell>
                     <LatencyCell latencyMs={proxy.latencyMs} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(proxy.lastTestedAt)}</TableCell>
                  <TableCell>
                     <div className="flex items-center justify-end gap-1">
                        <TestButton
                           label="Browser test"
                           icon={<ScanSearch />}
                           blocker={browserTestBlocker(proxy.status, browserTestAnnounced)}
                           busy={testingId === proxy.id}
                           onClick={() => onBrowserTest(proxy)}
                        />
                        <DropdownMenu>
                           <DropdownMenuTrigger asChild>
                              <Button
                                 variant="ghost"
                                 size="icon"
                                 aria-label={`Actions for ${proxy.host}:${proxy.port}`}
                              >
                                 {busyId === proxy.id ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
                              </Button>
                           </DropdownMenuTrigger>
                           <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => onTest(proxy)}>
                                 <RefreshCw />
                                 Test now
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => onHistory(proxy)}>
                                 <History />
                                 Test history
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => onEdit(proxy)}>
                                 <Pencil />
                                 Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" onSelect={() => onDelete(proxy)}>
                                 <Trash2 />
                                 Remove
                              </DropdownMenuItem>
                           </DropdownMenuContent>
                        </DropdownMenu>
                     </div>
                  </TableCell>
               </TableRow>
            ))}
         </TableBody>
      </Table>
   </div>
)
