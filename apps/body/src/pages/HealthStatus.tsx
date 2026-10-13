import { StatusBanner } from '@/components/status/status-banner'
import { StatusCard } from '@/components/status/status-card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'

import {
   UNREACHABLE_MESSAGE,
   bannerText,
   checkedText,
   groupModules,
   unreachableModules,
} from '@/components/status/describe'
import { trpc } from '../trpc'

// The page asks again every ten seconds, and the age of the answer ticks up in between.
const REFRESH_MS = 10_000

const useNow = (everyMs: number) => {
   const [now, setNow] = useState(() => Date.now())

   useEffect(() => {
      const timer = setInterval(() => setNow(Date.now()), everyMs)

      return () => clearInterval(timer)
   }, [everyMs])

   return now
}

export const HealthStatus = () => {
   const status = trpc.status.get.useQuery(undefined, {
      refetchInterval: REFRESH_MS,
      retry: false,
   })
   const now = useNow(1000)

   // A failed request is shown as what it is, never as the last good answer: a stale green would be wrong.
   const unreachable = Boolean(status.error)
   const modules = unreachable ? unreachableModules : (status.data?.modules ?? [])

   return (
      <div className="grid w-full gap-4 px-4 lg:px-6">
         <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
               <h2 className="text-lg font-semibold">Service status</h2>
               <p className="text-muted-foreground text-sm">
                  Is everything working?{' '}
                  {status.data && !unreachable ? checkedText(status.data.checkedAt, now) : null}
               </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void status.refetch()} disabled={status.isFetching}>
               <RefreshCw className={cn(status.isFetching && 'animate-spin')} />
               Refresh
            </Button>
         </div>

         {status.isPending ? <Skeleton className="h-16 w-full rounded-xl" /> : null}

         {unreachable ? <StatusBanner state="dead" title={UNREACHABLE_MESSAGE} /> : null}
         {status.data && !unreachable ? (
            <StatusBanner state={status.data.overall} title={bannerText(status.data.overall, status.data.modules)} />
         ) : null}

         {groupModules(modules).map(({ group, modules: grouped }) => (
            <section key={group} className="grid gap-2">
               <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{group}</h3>
               <div className="grid gap-2 sm:grid-cols-2">
                  {grouped.map(module => (
                     <StatusCard key={module.key} module={module} />
                  ))}
               </div>
            </section>
         ))}
      </div>
   )
}
