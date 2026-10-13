import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { timeAgo } from '@/lib/time-ago'
import { tone } from '@/lib/tone'
import { FileSearch, Star } from 'lucide-react'

import { cn } from '@/lib/utils'

import { type Proxy, type ProxyHandlers } from './types'

import { CheckChip } from './check-chip'
import { checksOf } from './checks'
import { levelInfo } from './health'
import { HealthBadge } from './health-badge'
import { ProxyMenu } from './proxy-menu'
import { SuggestionPanel } from './suggestion-panel'

type Props = {
   proxy: Proxy
   // The other proxies of the same account.
   siblings: Proxy[]
   handlers: ProxyHandlers
}

// One proxy, readable at a glance: how it is doing, the four checks behind that, and what to do about it.
export const ProxyCard = ({ proxy, siblings, handlers }: Props) => {
   const colours = tone[levelInfo[proxy.health.level].tone]

   return (
      <article
         className="bg-card grid overflow-hidden rounded-xl border"
         aria-label={`Proxy ${proxy.host}:${proxy.port}`}
      >
         <div className={cn('h-1', colours.solid)} aria-hidden />
         <div className="grid gap-4 p-4">
            <header className="flex flex-wrap items-start justify-between gap-3">
               <div className="grid gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                     <HealthBadge level={proxy.health.level} />
                     {proxy.isBest ? (
                        <Badge variant="outline" className={tone.info.badge}>
                           <Star aria-hidden />
                           In use
                        </Badge>
                     ) : null}
                  </div>
                  <p className="font-mono text-sm font-medium break-all">
                     {proxy.protocol.toLowerCase()}://{proxy.host}:{proxy.port}
                  </p>
                  <p className="text-muted-foreground text-xs">
                     Last tested {timeAgo(proxy.lastTestedAt)}
                     {proxy.score === null ? '' : ` · Score ${proxy.score} of 100`}
                  </p>
               </div>
               <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => handlers.onDetails(proxy)}>
                     <FileSearch />
                     Full report
                  </Button>
                  <ProxyMenu proxy={proxy} handlers={handlers} />
               </div>
            </header>

            <div className="grid gap-2 sm:grid-cols-2">
               {checksOf(proxy, siblings.length).map(check => (
                  <CheckChip key={check.key} check={check} />
               ))}
            </div>

            <SuggestionPanel proxy={proxy} siblings={siblings} handlers={handlers} />
         </div>
      </article>
   )
}
