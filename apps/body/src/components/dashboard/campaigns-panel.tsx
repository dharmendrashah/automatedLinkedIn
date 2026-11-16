import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { IconDotsVertical } from '@tabler/icons-react'
import { createColumnHelper } from '@tanstack/react-table'
import { createContext, useContext, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import type { DashboardOverview } from '@automatedLinkedIn/contracts'

import { trpc } from '../../trpc'
import { STATE_META } from '../campaigns/campaign-list-format'
import { formatPipelineUsd } from '../campaigns/pipeline-format'
import { type HiddenColumns } from '../table/use-hidden-columns'
import { type BulkAction, bulkConfirmText, bulkToast, runBulk } from './bulk'
import { Count, Dash } from './cells'
import { TabTable } from './dashboard-table'
import { campaignStatusText } from './format'
import { features } from './table-features'

type CampaignRow = DashboardOverview['campaigns'][number]

const column = createColumnHelper<typeof features, CampaignRow>()

// Pause and Resume one campaign after another through the campaign page's own procedures; `running` is set while the loop
// works. The loop is a plain async function, so leaving the page does not stop it half way.
const useRunner = (onChanged: () => Promise<unknown>) => {
   const { client } = trpc.useUtils()
   const [running, setRunning] = useState<{ action: BulkAction; count: number } | null>(null)

   // Answers the ids of the rows that failed, so the bar can keep them selected.
   const run = async (rows: CampaignRow[], action: BulkAction) => {
      setRunning({
         action,
         count: rows.filter(row => row.state !== 'NO_WORKFLOWS' && row.paused === (action === 'resume')).length,
      })

      try {
         const result = await runBulk(rows, action, async id => {
            if (action === 'pause') {
               await client.campaign.pause.mutate({
                  id,
                  stopQueued: false,
               })
            } else {
               await client.campaign.resume.mutate({ id })
            }
         })
         const [only] = rows
         const { kind, text } = bulkToast(action, result)

         if (kind === 'error') {
            toast.error(text)
         } else if (action === 'pause' && rows.length === 1 && only && result.done === 1) {
            toast.success(`Paused ${only.name}. Work already queued keeps going out.`)
         } else {
            toast.success(text)
         }

         await onChanged()

         return result.failedIds
      } finally {
         setRunning(null)
      }
   }

   return {
      running,
      run,
   }
}

type Runner = ReturnType<typeof useRunner>

// The row menus read the one runner of the tab, so the columns can stay constant.
const RunnerContext = createContext<Runner | null>(null)

const RowMenu = ({ row }: { row: CampaignRow }) => {
   const runner = useContext(RunnerContext)

   if (!runner) return null

   const action: BulkAction = row.paused ? 'resume' : 'pause'

   return (
      <DropdownMenu>
         <DropdownMenuTrigger asChild>
            <Button
               variant="ghost"
               className="flex size-8 text-muted-foreground data-[state=open]:bg-muted"
               size="icon"
               disabled={runner.running !== null}
            >
               <IconDotsVertical />
               <span className="sr-only">Open menu</span>
            </Button>
         </DropdownMenuTrigger>
         <DropdownMenuContent align="end" className="w-32">
            <DropdownMenuItem asChild>
               <Link to={`/campaigns/${row.id}`}>Open</Link>
            </DropdownMenuItem>
            <DropdownMenuItem
               disabled={row.state === 'NO_WORKFLOWS' || runner.running !== null}
               onSelect={() => void runner.run([row], action)}
            >
               {row.paused ? 'Resume' : 'Pause'}
            </DropdownMenuItem>
         </DropdownMenuContent>
      </DropdownMenu>
   )
}

const columns = column.columns([
   column.display({
      id: 'campaign',
      header: 'Campaign',
      cell: ({ row }) => (
         <Link
            className="max-w-64 truncate font-medium underline-offset-4 hover:underline"
            title={row.original.name}
            to={`/campaigns/${row.original.id}`}
         >
            {row.original.name}
         </Link>
      ),
   }),
   column.display({
      id: 'state',
      header: 'State',
      cell: ({ row }) => {
         const meta = STATE_META[row.original.state]
         const Icon = meta.icon

         return (
            <span className={`inline-flex items-center gap-1.5 ${meta.className}`}>
               <Icon aria-hidden className="size-4" />
               {meta.label}
            </span>
         )
      },
   }),
   column.display({
      id: 'status',
      header: 'Status',
      cell: ({ row }) =>
         row.original.status === 'none' ? <Dash /> : <span>{campaignStatusText(row.original.status)}</span>,
   }),
   column.display({
      id: 'qualified',
      header: 'Qualified (30 days)',
      cell: ({ row }) => <Count value={row.original.qualified} />,
   }),
   column.display({
      id: 'invited',
      header: 'Invited (30 days)',
      cell: ({ row }) => <Count value={row.original.invited} />,
   }),
   column.display({
      id: 'pipeline',
      header: 'Pipeline',
      cell: ({ row }) =>
         row.original.pipelineUsd === null ? (
            <Link
               className="text-xs text-muted-foreground underline-offset-4 hover:underline"
               to={`/campaigns/${row.original.id}`}
            >
               Set a worth
            </Link>
         ) : (
            <span className="font-medium text-emerald-600 tabular-nums dark:text-emerald-400">
               {formatPipelineUsd(row.original.pipelineUsd)}
            </span>
         ),
   }),
   column.display({
      id: 'menu',
      cell: ({ row }) => <RowMenu row={row.original} />,
   }),
])

const BulkBar = ({
   selected,
   keepSelected,
   runner,
}: {
   selected: CampaignRow[]
   keepSelected: (ids: string[]) => void
   runner: Runner
}) => {
   const [confirming, setConfirming] = useState<BulkAction | null>(null)
   const { running } = runner

   const go = async (action: BulkAction) => {
      setConfirming(null)
      keepSelected(await runner.run(selected, action))
   }
   const ask = (action: BulkAction) => {
      if (bulkConfirmText(action, selected.length) === null) {
         void go(action)
      } else {
         setConfirming(action)
      }
   }

   return (
      <>
         <Button size="sm" variant="outline" disabled={running !== null} onClick={() => ask('pause')}>
            {running?.action === 'pause' ? `Pausing ${running.count}...` : 'Pause'}
         </Button>
         <Button size="sm" variant="outline" disabled={running !== null} onClick={() => ask('resume')}>
            {running?.action === 'resume' ? `Resuming ${running.count}...` : 'Resume'}
         </Button>
         <AlertDialog open={confirming !== null} onOpenChange={open => (open ? undefined : setConfirming(null))}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>
                     {confirming === 'resume' ? 'Resume campaigns?' : 'Pause campaigns?'}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                     {confirming ? bulkConfirmText(confirming, selected.length) : null}
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => (confirming ? void go(confirming) : undefined)}>
                     {confirming === 'resume' ? 'Resume' : 'Pause'}
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </>
   )
}

// The Campaigns tab: the table with its checkboxes, the bulk bar and the row menus, which share one runner.
export const CampaignsPanel = ({
   rows,
   onChanged,
   hidden,
}: {
   rows: CampaignRow[]
   onChanged: () => Promise<unknown>
   hidden: HiddenColumns
}) => {
   const runner = useRunner(onChanged)

   return (
      <RunnerContext value={runner}>
         <TabTable
            rows={rows}
            columns={columns}
            getRowId={row => row.id}
            emptyText="No campaign yet."
            emptyAction={{
               label: 'New campaign',
               to: '/campaigns/new',
            }}
            selectable
            renderBulk={(selected, keepSelected) => (
               <BulkBar selected={selected} keepSelected={keepSelected} runner={runner} />
            )}
            hidden={hidden}
         />
      </RunnerContext>
   )
}
