import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { readableError } from '@/lib/trpc-error'
import { Loader2, Trash2 } from 'lucide-react'

import { type Proxy } from './types'

import { trpc } from '../../trpc'
import { CheckChip } from './check-chip'
import { checksOf } from './checks'
import { HealthBadge } from './health-badge'
import { suggest } from './suggest'

type Props = {
   // The proxy that was just added.
   proxyId: string
   // The proxy this one is meant to replace: removing it is offered, never done by itself.
   replacing: Proxy | null
   onDone: () => void
}

// What the owner sees right after adding a proxy: how it turned out, check by check, while the last ones finish.
export const ProxyResult = ({ proxyId, replacing, onDone }: Props) => {
   const utils = trpc.useUtils()
   const list = trpc.proxyServer.list.useQuery(undefined, { retry: false })
   const proxy = list.data?.find(entry => entry.id === proxyId)
   const siblings = list.data?.filter(
      entry => entry.linkedInAccountId === proxy?.linkedInAccountId && entry.id !== proxyId
   )

   const remove = trpc.proxyServer.delete.useMutation({
      onSuccess: () => {
         void utils.proxyServer.list.invalidate()
         void utils.linkedInAccount.list.invalidate()
         onDone()
      },
   })

   const works = proxy?.status === 'ACTIVE' || proxy?.status === 'GEO_MISMATCH'

   return (
      <div className="grid gap-6">
         <DialogHeader>
            <DialogTitle>{replacing ? 'Replacement added' : 'Proxy added'}</DialogTitle>
            <DialogDescription>
               {proxy ? `${proxy.host}:${proxy.port} for ${proxy.linkedInAccount.email}` : 'Testing it now.'}
            </DialogDescription>
         </DialogHeader>

         {!proxy ? <Skeleton className="h-40 w-full rounded-xl" /> : null}

         {proxy && siblings ? (
            <div className="grid gap-4">
               <div className="flex flex-wrap items-center gap-2">
                  <HealthBadge level={proxy.health.level} />
                  <p className="text-muted-foreground text-sm">{suggest(proxy, siblings).text}</p>
               </div>
               <div className="grid gap-2 sm:grid-cols-2">
                  {checksOf(proxy, siblings.length).map(check => (
                     <CheckChip key={check.key} check={check} />
                  ))}
               </div>
            </div>
         ) : null}

         {replacing ? (
            <Alert>
               <Trash2 />
               <AlertTitle>The old proxy is still there</AlertTitle>
               <AlertDescription>
                  <p>
                     {replacing.host}:{replacing.port} is not removed.{' '}
                     {works
                        ? 'The new one works, so you can remove the old one now, or keep both and let us use the healthiest.'
                        : 'Wait until the new one works before removing the old one.'}
                  </p>
               </AlertDescription>
            </Alert>
         ) : null}

         {remove.error ? (
            <Alert variant="destructive">
               <AlertTitle>We could not remove it</AlertTitle>
               <AlertDescription>{readableError(remove.error)}</AlertDescription>
            </Alert>
         ) : null}

         <DialogFooter>
            {replacing ? (
               <Button
                  variant="outline"
                  disabled={!works || remove.isPending}
                  onClick={() => remove.mutate({ id: replacing.id })}
               >
                  {remove.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  Remove the old one
               </Button>
            ) : null}
            <DialogClose asChild>
               <Button type="button" onClick={onDone}>
                  {replacing ? 'Keep both' : 'Done'}
               </Button>
            </DialogClose>
         </DialogFooter>
      </div>
   )
}
