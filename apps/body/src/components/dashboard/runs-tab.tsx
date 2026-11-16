import { Badge } from '@/components/ui/badge'
import { createColumnHelper } from '@tanstack/react-table'
import { Link } from 'react-router'

import { type DashboardOverview, STAGE_LABELS, formatWhen } from '@automatedLinkedIn/contracts'

import { cn } from '@/lib/utils'

import { formatUsd, runStatuses } from '../workflows/types'

import { Count } from './cells'
import { type TabEntry, TabTable } from './dashboard-table'
import { features } from './table-features'

type RunRow = DashboardOverview['runs'][number]

const column = createColumnHelper<typeof features, RunRow>()

const HIDEABLE: Array<[string, string]> = [
   ['workflow', 'Workflow'],
   ['stage', 'Stage'],
   ['status', 'Status'],
   ['started', 'Started'],
   ['scored', 'Scored'],
   ['qualified', 'Qualified (by score)'],
   ['campaign', 'Campaign'],
   ['cost', 'Cost'],
]

const columnsOf = (now: Date) =>
   column.columns([
      column.display({
         id: 'workflow',
         header: 'Workflow',
         cell: ({ row }) => (
            <Link
               className="max-w-64 truncate font-medium underline-offset-4 hover:underline"
               title={row.original.workflow}
               to={`/workflows/${row.original.workflowId}`}
            >
               {row.original.workflow}
            </Link>
         ),
      }),
      column.display({
         id: 'stage',
         header: 'Stage',
         cell: ({ row }) => <span>{STAGE_LABELS[row.original.stage]}</span>,
      }),
      column.display({
         id: 'status',
         header: 'Status',
         cell: ({ row }) => {
            const { label, className } = runStatuses[row.original.status]

            return (
               <Badge variant="outline" className={cn('px-1.5', className)}>
                  {label}
               </Badge>
            )
         },
      }),
      column.display({
         id: 'started',
         header: 'Started',
         cell: ({ row }) => <span className="whitespace-nowrap">{formatWhen(row.original.startedAt, now)}</span>,
      }),
      column.display({
         id: 'scored',
         header: 'Scored',
         cell: ({ row }) => <Count value={row.original.scored} />,
      }),
      column.display({
         id: 'qualified',
         header: 'Qualified (by score)',
         cell: ({ row }) => <Count value={row.original.qualified} />,
      }),
      column.display({
         id: 'campaign',
         header: 'Campaign',
         cell: ({ row }) =>
            row.original.campaign === null ? (
               <span className="text-muted-foreground">No campaign</span>
            ) : (
               <span className="max-w-48 truncate" title={row.original.campaign}>
                  {row.original.campaign}
               </span>
            ),
      }),
      column.display({
         id: 'cost',
         header: 'Cost',
         cell: ({ row }) => <span className="tabular-nums">{formatUsd(row.original.costMicros)}</span>,
      }),
   ])

export const runsTab = ({ rows, generatedAt }: { rows: RunRow[]; generatedAt: string }): TabEntry => {
   const columns = columnsOf(new Date(generatedAt))

   return {
      key: 'runs',
      label: 'Recent runs',
      count: rows.length,
      hideable: HIDEABLE,
      content: hidden => (
         <TabTable
            rows={rows}
            columns={columns}
            getRowId={row => row.id}
            emptyText="No run in the last 30 days."
            hidden={hidden}
         />
      ),
   }
}
