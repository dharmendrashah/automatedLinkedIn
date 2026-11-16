import { ChartAreaInteractive, ChartSkeleton } from '@/components/chart-area-interactive'
import { accountsTab } from '@/components/dashboard/accounts-tab'
import { attentionTab } from '@/components/dashboard/attention-tab'
import { campaignsTab } from '@/components/dashboard/campaigns-tab'
import { DashboardError } from '@/components/dashboard/dashboard-error'
import { DashboardTable, DashboardTableSkeleton } from '@/components/dashboard/dashboard-table'
import { unavailableText } from '@/components/dashboard/format'
import { runsTab } from '@/components/dashboard/runs-tab'
import { SectionCards, SectionCardsSkeleton } from '@/components/section-cards'
import { useMemo } from 'react'

import { trpc } from '../trpc'

export const Dashboard = () => {
   const utils = trpc.useUtils()
   // Sent on its own, not in the batch of the header's calls; one response feeds the cards, the chart and the table.
   const overview = trpc.dashboard.overview.useQuery(undefined, {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: false,
      trpc: { context: { skipBatch: true } },
   })
   const { data } = overview
   const tabs = useMemo(() => {
      if (!data) return []

      const { generatedAt } = data
      const onChanged = () => Promise.all([utils.dashboard.overview.invalidate(), utils.campaign.list.invalidate()])

      return [
         campaignsTab({
            rows: data.campaigns,
            generatedAt,
            onChanged,
         }),
         accountsTab({
            rows: data.accounts,
            generatedAt,
         }),
         runsTab({
            rows: data.runs,
            generatedAt,
         }),
         attentionTab({
            rows: data.attention,
            generatedAt,
         }),
      ]
   }, [data, utils])

   if (!data) {
      return (
         <div className="grid w-full gap-4 px-4 md:gap-6 lg:px-6">
            {overview.isError ? (
               <DashboardError onRetry={() => void overview.refetch()} />
            ) : (
               <>
                  <SectionCardsSkeleton />
                  <ChartSkeleton />
                  <DashboardTableSkeleton />
               </>
            )}
         </div>
      )
   }

   const unavailable = unavailableText(data.unavailable)

   return (
      <div className="grid w-full gap-4 px-4 md:gap-6 lg:px-6">
         {overview.isError ? <DashboardError onRetry={() => void overview.refetch()} /> : null}
         <SectionCards cards={data.cards} generatedAt={data.generatedAt} />
         <ChartAreaInteractive series={data.series} />
         {unavailable ? <p className="text-sm text-muted-foreground">{unavailable}</p> : null}
         <DashboardTable tabs={tabs} />
      </div>
   )
}
