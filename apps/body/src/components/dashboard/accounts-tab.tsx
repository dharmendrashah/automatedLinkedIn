import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { IconDotsVertical } from '@tabler/icons-react'
import { createColumnHelper } from '@tanstack/react-table'
import { Link } from 'react-router'

import type { DashboardOverview } from '@automatedLinkedIn/contracts'

import { acceptLabel } from '../campaigns/campaign-list-format'
import { AccountStatusCell } from './account-status-cell'
import { type TabEntry, TabTable } from './dashboard-table'
import { features } from './table-features'

type AccountRow = DashboardOverview['accounts'][number]

const column = createColumnHelper<typeof features, AccountRow>()

const HIDEABLE: Array<[string, string]> = [
   ['account', 'Account'],
   ['status', 'Status'],
   ['invites', 'Invites in 24 h'],
   ['acceptRate', 'Accept rate (14-day cohort)'],
   ['pending', 'Pending invites'],
]

const columnsOf = (now: Date) =>
   column.columns([
      column.display({
         id: 'account',
         header: 'Account',
         cell: ({ row }) => (
            <div className="grid min-w-0">
               <Link
                  className="max-w-64 truncate font-medium underline-offset-4 hover:underline"
                  title={row.original.name}
                  to={`/accounts/${row.original.id}`}
               >
                  {row.original.name}
               </Link>
               <span className="max-w-64 truncate text-xs text-muted-foreground">{row.original.email}</span>
            </div>
         ),
      }),
      column.display({
         id: 'status',
         header: 'Status',
         cell: ({ row }) => <AccountStatusCell row={row.original} now={now} />,
      }),
      column.display({
         id: 'invites',
         header: 'Invites in 24 h',
         cell: ({ row }) => (
            <span className="tabular-nums">{`${row.original.invitesUsed} of ${row.original.invitesLimit}`}</span>
         ),
      }),
      column.display({
         id: 'acceptRate',
         header: 'Accept rate (14-day cohort)',
         cell: ({ row }) => <span className="tabular-nums">{acceptLabel(row.original.acceptRate)}</span>,
      }),
      column.display({
         id: 'pending',
         header: 'Pending invites',
         cell: ({ row }) => <span className="tabular-nums">{row.original.pending}</span>,
      }),
      column.display({
         id: 'menu',
         cell: ({ row }) => (
            <DropdownMenu>
               <DropdownMenuTrigger asChild>
                  <Button
                     variant="ghost"
                     className="flex size-8 text-muted-foreground data-[state=open]:bg-muted"
                     size="icon"
                  >
                     <IconDotsVertical />
                     <span className="sr-only">Open menu</span>
                  </Button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="end" className="w-32">
                  <DropdownMenuItem asChild>
                     <Link to={`/accounts/${row.original.id}`}>Open</Link>
                  </DropdownMenuItem>
               </DropdownMenuContent>
            </DropdownMenu>
         ),
      }),
   ])

export const accountsTab = ({ rows, generatedAt }: { rows: AccountRow[]; generatedAt: string }): TabEntry => {
   const columns = columnsOf(new Date(generatedAt))

   return {
      key: 'accounts',
      label: 'Accounts',
      count: rows.length,
      hideable: HIDEABLE,
      content: hidden => (
         <TabTable
            rows={rows}
            columns={columns}
            getRowId={row => row.id}
            emptyText="No account yet."
            emptyAction={{
               label: 'Add an account',
               to: '/accounts',
            }}
            hidden={hidden}
         />
      ),
   }
}
