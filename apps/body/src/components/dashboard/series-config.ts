import { type ChartConfig } from '@/components/ui/chart'

export const seriesConfig = {
   found: {
      label: 'Found',
      color: 'var(--chart-1)',
   },
   qualified: {
      label: 'Qualified',
      color: 'var(--chart-2)',
   },
   invited: {
      label: 'Invited',
      color: 'var(--chart-3)',
   },
   accepted: {
      label: 'Accepted',
      color: 'var(--chart-4)',
   },
} satisfies ChartConfig
