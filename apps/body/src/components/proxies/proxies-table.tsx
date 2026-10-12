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
import { Loader2, MoreHorizontal, Network, Pencil, RefreshCw, Trash2 } from 'lucide-react'

import { type Proxy } from './types'

import { ProxyStatusBadge } from './proxy-status-badge'

const formatDate = (value: string | Date | null) => (value ? new Date(value).toLocaleString() : 'Never')

type Props = {
   proxies: Proxy[] | undefined
   loading: boolean
   error: string | undefined
   busyId: string | undefined
   onEdit: (proxy: Proxy) => void
   onTest: (proxy: Proxy) => void
   onDelete: (proxy: Proxy) => void
}

export const ProxiesTable = ({ proxies, loading, error, busyId, onEdit, onTest, onDelete }: Props) => (
   <div className="overflow-hidden rounded-lg border">
      <Table>
         <TableHeader className="bg-muted/50">
            <TableRow>
               <TableHead>Proxy</TableHead>
               <TableHead>LinkedIn account</TableHead>
               <TableHead>Status</TableHead>
               <TableHead>Detected country</TableHead>
               <TableHead>Last tested</TableHead>
               <TableHead className="w-12" />
            </TableRow>
         </TableHeader>
         <TableBody>
            {loading ? (
               <TableRow>
                  <TableCell colSpan={6}>
                     <Skeleton className="h-8 w-full" />
                  </TableCell>
               </TableRow>
            ) : null}
            {error ? (
               <TableRow>
                  <TableCell colSpan={6} className="text-destructive h-24 text-center text-sm">
                     {error}
                  </TableCell>
               </TableRow>
            ) : null}
            {proxies?.length === 0 ? (
               <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground h-24 text-center text-sm">
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
                  <TableCell className="text-muted-foreground">{formatDate(proxy.lastTestedAt)}</TableCell>
                  <TableCell>
                     <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                           <Button variant="ghost" size="icon" aria-label={`Actions for ${proxy.host}:${proxy.port}`}>
                              {busyId === proxy.id ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
                           </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                           <DropdownMenuItem onSelect={() => onTest(proxy)}>
                              <RefreshCw />
                              Test now
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
                  </TableCell>
               </TableRow>
            ))}
         </TableBody>
      </Table>
   </div>
)
