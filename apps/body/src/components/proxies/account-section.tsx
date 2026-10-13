import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { tone } from '@/lib/tone'
import { type Tone } from '@/lib/tone'
import { AlertTriangle, Info, Loader2, Network, Plus, ShieldAlert, ShieldCheck } from 'lucide-react'

import { cn } from '@/lib/utils'

import { type ProxyHandlers } from './types'

import { type AccountGroup } from './grouping'
import { ProxyCard } from './proxy-card'

const icons = {
   success: ShieldCheck,
   warning: AlertTriangle,
   danger: ShieldAlert,
   info: Loader2,
   neutral: Info,
} satisfies Record<Tone, unknown>

type Props = {
   group: AccountGroup
   handlers: ProxyHandlers
   onAdd: (accountId: string) => void
}

// One LinkedIn account: whether it can run, through which proxy, and its proxies as cards.
export const AccountSection = ({ group, handlers, onAdd }: Props) => {
   const { account, proxies, total, readiness } = group
   const paused = account.status === 'DISABLED'
   const shownTone: Tone = paused ? 'neutral' : readiness.tone
   const Icon = icons[shownTone]

   return (
      <section className="grid gap-3" aria-label={`Proxies of ${account.email}`}>
         <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1.5">
               <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold">{account.email}</h3>
                  <Badge variant="outline" className={cn('gap-1.5 py-1', tone[shownTone].badge)}>
                     <Icon className={cn(shownTone === 'info' && 'animate-spin')} aria-hidden />
                     {paused ? 'Account paused' : readiness.label}
                  </Badge>
               </div>
               <p className="text-muted-foreground text-sm">
                  {paused ? 'This account is paused, so nothing runs for it until you resume it.' : readiness.text}
               </p>
            </div>
            {total > 0 ? (
               <Button variant="outline" size="sm" onClick={() => onAdd(account.id)}>
                  <Plus />
                  Add a proxy
               </Button>
            ) : null}
         </header>

         {readiness.note && !paused ? (
            <p className={cn('flex items-start gap-2 rounded-lg border p-3 text-sm', tone.info.panel)}>
               <Info className={cn('mt-0.5 size-4 shrink-0', tone.info.text)} aria-hidden />
               {readiness.note}
            </p>
         ) : null}

         {total === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center">
               <span className="bg-muted text-muted-foreground grid size-10 place-items-center rounded-full">
                  <Network className="size-5" aria-hidden />
               </span>
               <p className="text-sm font-medium">This account has no proxy yet</p>
               <p className="text-muted-foreground max-w-md text-sm">
                  A proxy is the internet address LinkedIn sees when we sign in as you. Add one and we will test it
                  right away.
               </p>
               <Button size="sm" onClick={() => onAdd(account.id)}>
                  <Plus />
                  Add a proxy
               </Button>
            </div>
         ) : (
            <div className="grid gap-4 xl:grid-cols-2">
               {proxies.map(proxy => (
                  <ProxyCard
                     key={proxy.id}
                     proxy={proxy}
                     siblings={group.all.filter(other => other.id !== proxy.id)}
                     handlers={handlers}
                  />
               ))}
            </div>
         )}
      </section>
   )
}
