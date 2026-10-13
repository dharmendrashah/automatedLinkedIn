import { Button } from '@/components/ui/button'
import { tone } from '@/lib/tone'
import { ArrowLeftRight, Lightbulb, Loader2, Pencil, RefreshCw, ShieldOff, Undo2 } from 'lucide-react'

import { cn } from '@/lib/utils'

import { type Proxy, type ProxyHandlers } from './types'

import { levelInfo } from './health'
import { type SuggestedAction, suggest } from './suggest'

type ButtonProps = {
   action: SuggestedAction
   // The first button is the suggested one.
   primary: boolean
   // Whether another proxy is offered instead, which changes what "swap" says.
   swapsToAnother: boolean
   proxy: Proxy
   handlers: ProxyHandlers
}

export const ActionButton = ({ action, primary, swapsToAnother, proxy, handlers }: ButtonProps) => {
   const variant = primary ? 'default' : 'outline'
   const busy = handlers.busyId === proxy.id

   switch (action.kind) {
      case 'use-instead':
         return (
            <Button size="sm" variant={variant} onClick={() => handlers.onUseInstead(action.target)}>
               <ArrowLeftRight />
               Use {action.target.host}:{action.target.port} instead
            </Button>
         )
      case 'replace':
         return (
            <Button size="sm" variant={variant} onClick={() => handlers.onReplace(proxy)}>
               <ArrowLeftRight />
               {swapsToAnother ? 'Add a replacement' : 'Swap it'}
            </Button>
         )
      case 'accept':
         return (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => handlers.onAccept(proxy)}>
               <ShieldOff />
               Keep using it
            </Button>
         )
      case 'undo-accept':
         return (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => handlers.onUndoAccept(proxy)}>
               <Undo2 />
               Undo
            </Button>
         )
      case 'test':
         return (
            <Button size="sm" variant={variant} disabled={busy} onClick={() => handlers.onTest(proxy)}>
               {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
               Test again
            </Button>
         )
      case 'edit':
         return (
            <Button size="sm" variant={variant} onClick={() => handlers.onEdit(proxy)}>
               <Pencil />
               Edit details
            </Button>
         )
   }
}

// The buttons of a suggestion, the suggested one first.
export const ActionButtons = ({ proxy, siblings, handlers }: Props) => {
   const { actions } = suggest(proxy, siblings)
   const swapsToAnother = actions.some(action => action.kind === 'use-instead')

   return actions.map((action, index) => (
      <ActionButton
         key={action.kind}
         action={action}
         primary={index === 0}
         swapsToAnother={swapsToAnother}
         proxy={proxy}
         handlers={handlers}
      />
   ))
}

type Props = {
   proxy: Proxy
   siblings: Proxy[]
   handlers: ProxyHandlers
}

// The advice under a proxy and the buttons that go with it. The first button is the suggested one; nothing is forced,
// and "keep using it" is always there when keeping it is possible.
export const SuggestionPanel = ({ proxy, siblings, handlers }: Props) => {
   const { text, actions } = suggest(proxy, siblings)
   const colours = tone[levelInfo[proxy.health.level].tone]

   return (
      <div className={cn('grid gap-3 rounded-lg border p-3', colours.panel)}>
         <p className="flex gap-2 text-sm leading-relaxed">
            <Lightbulb className={cn('mt-0.5 size-4 shrink-0', colours.text)} aria-hidden />
            <span>{text}</span>
         </p>
         {actions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
               <ActionButtons proxy={proxy} siblings={siblings} handlers={handlers} />
            </div>
         ) : null}
      </div>
   )
}
