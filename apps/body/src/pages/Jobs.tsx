import { FailureCard } from '@/components/failure-card'
import { JobCard } from '@/components/jobs/job-card'
import { JobRunsDrawer } from '@/components/jobs/job-runs-drawer'
import { MessageReads } from '@/components/jobs/message-reads'
import { workerBanner } from '@/components/jobs/describe'
import { type Job } from '@/components/jobs/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'

import { tone } from '@/lib/tone'
import { cn } from '@/lib/utils'

import { trpc } from '../trpc'

const REFRESH_MS = 30_000

const useNow = (everyMs: number) => {
   const [now, setNow] = useState(() => Date.now())

   useEffect(() => {
      const timer = setInterval(() => setNow(Date.now()), everyMs)

      return () => clearInterval(timer)
   }, [everyMs])

   return now
}

// The admin's cron monitor (.plan/cron-monitor.md): are the brain worker's jobs running on time, and what did each run do.
// For anyone else the page does not exist; the API refuses them as well.
export const Jobs = () => {
   const me = trpc.me.useQuery(undefined, { retry: false })
   const isAdmin = me.data?.user?.role === 'ADMIN'
   const overview = trpc.jobs.overview.useQuery(undefined, {
      enabled: isAdmin,
      refetchInterval: REFRESH_MS,
      retry: false,
   })
   const [open, setOpen] = useState<Job | null>(null)
   const now = useNow(1000)

   if (me.isPending) {
      return null
   }

   if (!isAdmin) {
      return (
         <FailureCard title="Page not found" message="This page does not exist." to="/" action="Back to home" />
      )
   }

   const banner = overview.data ? workerBanner(overview.data.worker, overview.data.lastRunAt, now) : null

   return (
      <div className="grid w-full gap-4 px-4 lg:px-6">
         <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
               <h2 className="text-lg font-semibold">Cron monitor</h2>
               <p className="text-muted-foreground text-sm">
                  Do the background jobs run on time, and what did each run do? Only you can see this.
               </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void overview.refetch()} disabled={overview.isFetching}>
               <RefreshCw className={cn(overview.isFetching && 'animate-spin')} />
               Refresh
            </Button>
         </div>

         {overview.isPending ? <Skeleton className="h-16 w-full rounded-xl" /> : null}
         {overview.error ? <p className="text-destructive text-sm">{overview.error.message}</p> : null}
         {banner ? (
            <div className={cn('rounded-xl border px-4 py-3 text-sm font-medium', tone[banner.tone].panel)}>
               {banner.title}
            </div>
         ) : null}

         <Tabs defaultValue="jobs" className="gap-4">
            <TabsList>
               <TabsTrigger value="jobs">Jobs</TabsTrigger>
               <TabsTrigger value="messages">Message reads</TabsTrigger>
            </TabsList>
            <TabsContent value="jobs">
               <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {overview.data?.jobs.map(job => (
                     <JobCard key={job.name} job={job} now={now} onOpen={() => setOpen(job)} />
                  ))}
               </div>
            </TabsContent>
            <TabsContent value="messages">
               <MessageReads now={now} />
            </TabsContent>
         </Tabs>

         <JobRunsDrawer job={open} now={now} onClose={() => setOpen(null)} />
      </div>
   )
}
