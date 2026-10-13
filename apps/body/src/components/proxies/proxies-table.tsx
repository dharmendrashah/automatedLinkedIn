import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { timeAgo } from '@/lib/time-ago'
import { tone } from '@/lib/tone'
import { FileSearch, Network } from 'lucide-react'

import { cn } from '@/lib/utils'

import { type Proxy, type ProxyHandlers } from './types'

import { type Check, checksOf } from './checks'
import { HealthBadge } from './health-badge'
import { ProxyMenu } from './proxy-menu'
import { suggest } from './suggest'
import { ActionButtons } from './suggestion-panel'

// One check as a short result: its icon, colour and word. The full reason is on the card and in the report.
const CheckCell = ({ check }: { check: Check }) => (
   <span className={cn('flex items-center gap-1.5 text-sm font-medium', tone[check.tone].text)} title={check.reason}>
      <check.stateIcon className={cn('size-3.5 shrink-0', check.tone === 'info' && 'animate-spin')} aria-hidden />
      {check.result}
   </span>
)

type Props = {
   proxies: Proxy[] | undefined
   loading: boolean
   error: string | undefined
   handlers: ProxyHandlers
}

// The same proxies as the cards, as a compact list: health, the four checks as a word each, and the suggested actions.
export const ProxiesTable = ({ proxies, loading, error, handlers }: Props) => (
   <div className="overflow-hidden rounded-lg border">
      <Table>
         <TableHeader className="bg-muted/50">
            <TableRow>
               <TableHead>Proxy</TableHead>
               <TableHead>Health</TableHead>
               <TableHead>Connection</TableHead>
               <TableHead>Reputation</TableHead>
               <TableHead>Location</TableHead>
               <TableHead>Browser check</TableHead>
               <TableHead>Last tested</TableHead>
               <TableHead>What to do</TableHead>
               <TableHead className="w-24" />
            </TableRow>
         </TableHeader>
         <TableBody>
            {loading ? (
               <TableRow>
                  <TableCell colSpan={9}>
                     <Skeleton className="h-8 w-full" />
                  </TableCell>
               </TableRow>
            ) : null}
            {error ? (
               <TableRow>
                  <TableCell colSpan={9} className="text-destructive h-24 text-center text-sm">
                     {error}
                  </TableCell>
               </TableRow>
            ) : null}
            {proxies?.length === 0 ? (
               <TableRow>
                  <TableCell colSpan={9} className="text-muted-foreground h-24 text-center text-sm">
                     <Network className="mx-auto mb-2 size-5" aria-hidden />
                     Nothing to show here.
                  </TableCell>
               </TableRow>
            ) : null}
            {proxies?.map(proxy => {
               const siblings = proxies.filter(
                  other => other.id !== proxy.id && other.linkedInAccountId === proxy.linkedInAccountId
               )
               const checks = checksOf(proxy, siblings.length)

               return (
                  <TableRow key={proxy.id}>
                     <TableCell>
                        <p className="font-mono text-sm font-medium">
                           {proxy.host}:{proxy.port}
                        </p>
                        <p className="text-muted-foreground text-xs">{proxy.linkedInAccount.email}</p>
                     </TableCell>
                     <TableCell>
                        <HealthBadge level={proxy.health.level} />
                     </TableCell>
                     {checks.map(check => (
                        <TableCell key={check.key}>
                           <CheckCell check={check} />
                        </TableCell>
                     ))}
                     <TableCell className="text-muted-foreground text-sm">{timeAgo(proxy.lastTestedAt)}</TableCell>
                     <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                           <ActionButtons proxy={proxy} siblings={siblings} handlers={handlers} />
                           {suggest(proxy, siblings).actions.length === 0 ? (
                              <span className="text-muted-foreground text-sm">
                                 {proxy.health.level === 'HEALTHY' ? 'Nothing to do' : 'Nothing right now'}
                              </span>
                           ) : null}
                        </div>
                     </TableCell>
                     <TableCell>
                        <div className="flex items-center justify-end gap-1">
                           <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Full report for ${proxy.host}:${proxy.port}`}
                              onClick={() => handlers.onDetails(proxy)}
                           >
                              <FileSearch />
                           </Button>
                           <ProxyMenu proxy={proxy} handlers={handlers} />
                        </div>
                     </TableCell>
                  </TableRow>
               )
            })}
         </TableBody>
      </Table>
   </div>
)
