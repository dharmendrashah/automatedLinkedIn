import { Badge } from '@/components/ui/badge'
import { createColumnHelper } from '@tanstack/react-table'
import { Link } from 'react-router'

import { type DashboardOverview, formatWhen } from '@automatedLinkedIn/contracts'

import { type TabEntry, TabTable } from './dashboard-table'
import { features } from './table-features'

type AttentionRow = DashboardOverview['attention'][number]

const column = createColumnHelper<typeof features, AttentionRow>()

// The Problem column always shows, so it is not in the list.
const HIDEABLE: Array<[string, string]> = [
   ['severity', 'Severity'],
   ['since', 'Since'],
]

const columnsOf = (now: Date) =>
   column.columns([
      column.display({
         id: 'severity',
         header: 'Severity',
         cell: ({ row }) =>
            row.original.severity === 'high' ? (
               <Badge variant="outline" className="bg-destructive/10 text-destructive">
                  High
               </Badge>
            ) : (
               <Badge variant="outline" className="bg-warning/10 text-warning">
                  Medium
               </Badge>
            ),
      }),
      column.display({
         id: 'problem',
         header: 'Problem',
         cell: ({ row }) => (
            <Link
               className="underline-offset-4 hover:underline"
               to={row.original.route}
               onClick={event => event.stopPropagation()}
            >
               {row.original.sentence}
            </Link>
         ),
      }),
      column.display({
         id: 'since',
         header: 'Since',
         cell: ({ row }) =>
            row.original.at === null ? (
               <span className="text-muted-foreground">—</span>
            ) : (
               <span className="whitespace-nowrap">{formatWhen(row.original.at, now)}</span>
            ),
      }),
   ])

export const attentionTab = ({ rows, generatedAt }: { rows: AttentionRow[]; generatedAt: string }): TabEntry => {
   const columns = columnsOf(new Date(generatedAt))

   return {
      key: 'attention',
      label: 'Needs attention',
      count: rows.length,
      hideable: HIDEABLE,
      content: hidden => (
         <TabTable
            rows={rows}
            columns={columns}
            getRowId={row => row.id}
            emptyText="Nothing needs you."
            rowRoute={row => row.route}
            hidden={hidden}
         />
      ),
   }
}
