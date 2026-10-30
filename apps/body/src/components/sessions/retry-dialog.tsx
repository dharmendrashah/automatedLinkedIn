import { RadioMark } from '@/components/radio-mark'
import { Button } from '@/components/ui/button'
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
import { Loader2 } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

import { type SessionDetail } from './types'

import { trpc } from '../../trpc'
import { isBudgetRefusal } from '../accounts/budget-refusal'
import { describeLatency, speedClass } from '../proxies/latency'

type Props = {
   session: SessionDetail
   open: boolean
   onOpenChange: (open: boolean) => void
   onStarted: (id: string) => void
}

// Starts the same check again. The proxy is the only thing that can change, and only to one of this account's own.
export const RetryDialog = ({ session, open, onOpenChange, onStarted }: Props) => {
   const utils = trpc.useUtils()
   const [chosen, setChosen] = useState<string | null>(null)
   const [understood, setUnderstood] = useState(false)
   const proxies = session.retryProxies

   // The proxy it ran through is chosen to begin with, so "Try again" alone repeats it.
   const selected =
      chosen ?? (proxies.some(proxy => proxy.id === session.proxyServerId) ? session.proxyServerId : proxies[0]?.id)

   const started = {
      onSuccess: ({ id }: { id: string }) => {
         void utils.session.list.invalidate()
         void utils.session.get.invalidate({ id: session.id })
         onOpenChange(false)
         onStarted(id)
      },
   }
   const retryCheck = trpc.session.retry.useMutation(started)
   const runAgain = trpc.task.run.useMutation(started)
   // An older check is tried again through the account's own flow; a task run starts the same task with the same input.
   const { requestParams } = session
   const retry = requestParams.action === 'TASK' ? runAgain : retryCheck
   // The account may not browse now (its rest, hours or day): the owner can start it anyway, after saying they understand.
   const blocked = requestParams.action === 'TASK' && retry.error ? isBudgetRefusal(retry.error) : false

   const close = (next: boolean) => {
      if (!next) {
         setChosen(null)
         setUnderstood(false)
         retry.reset()
      }

      onOpenChange(next)
   }

   return (
      <Dialog open={open} onOpenChange={close}>
         <DialogContent className="sm:max-w-lg">
            <DialogHeader>
               <DialogTitle>
                  {requestParams.action === 'TASK' ? 'Run again with a proxy' : 'Try again with another proxy'}
               </DialogTitle>
               <DialogDescription>
                  {requestParams.action === 'TASK'
                     ? 'Same task, same input. Only the proxy can change, and only to one of this account’s own.'
                     : "Same account, same action. Only the proxy changes, and the account's current saved credentials are used."}
               </DialogDescription>
            </DialogHeader>

            {proxies.length === 0 ? (
               <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
                  This account has no working proxy. Add one on the Proxies page first.
               </p>
            ) : (
               <ul className="grid max-h-72 gap-2 overflow-y-auto py-1" aria-label="Proxies">
                  {proxies.map(proxy => {
                     const latency = describeLatency(proxy.latencyMs)
                     const isChosen = proxy.id === selected

                     return (
                        <li key={proxy.id}>
                           <button
                              type="button"
                              onClick={() => setChosen(proxy.id)}
                              aria-pressed={isChosen}
                              className={cn(
                                 'bg-card hover:bg-muted/60 focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors outline-none focus-visible:ring-[3px]',
                                 isChosen && 'border-primary/60 bg-muted/60 ring-primary/20 ring-1'
                              )}
                           >
                              <div className="grid min-w-0 flex-1 gap-0.5">
                                 <span className="truncate font-mono text-xs">
                                    {`${proxy.protocol.toLowerCase()}://${proxy.host}:${proxy.port}`}
                                 </span>
                                 <span className="text-muted-foreground text-xs">
                                    {[
                                       proxy.detectedCountry,
                                       proxy.id === session.proxyServerId ? 'Used by this session' : undefined,
                                       proxy.isPrimary ? 'Primary' : undefined,
                                    ]
                                       .filter(Boolean)
                                       .join(' · ')}
                                 </span>
                              </div>
                              {latency ? (
                                 <span className={cn('text-xs font-medium tabular-nums', speedClass[latency.speed])}>
                                    {latency.text}
                                 </span>
                              ) : null}
                              <RadioMark checked={isChosen} />
                           </button>
                        </li>
                     )
                  })}
               </ul>
            )}

            {retry.error ? <p className="text-destructive text-sm">{retry.error.message}</p> : null}

            {blocked ? (
               <div className="flex items-center gap-2">
                  <Checkbox
                     id="retry-start-anyway"
                     checked={understood}
                     onCheckedChange={value => setUnderstood(value === true)}
                  />
                  <Label htmlFor="retry-start-anyway">I understand this can put the account at risk.</Label>
               </div>
            ) : null}

            <DialogFooter>
               <Button variant="outline" onClick={() => close(false)}>
                  Cancel
               </Button>
               <Button
                  disabled={!selected || retry.isPending || (blocked && !understood)}
                  onClick={() => {
                     if (!selected) {
                        return
                     }

                     if (requestParams.action === 'TASK') {
                        runAgain.mutate({
                           task: session.task as string,
                           proxyId: selected,
                           input: requestParams.input,
                           ...(blocked && { startAnyway: true }),
                        })
                     } else {
                        retryCheck.mutate({
                           id: session.id,
                           proxyId: selected,
                        })
                     }
                  }}
               >
                  {retry.isPending ? <Loader2 className="animate-spin" /> : null}
                  Start
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   )
}
