import { StateRows } from '@/components/links/state-rows'
import { RunStatusBadge } from '@/components/workflows/runs'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Workflow as WorkflowIcon } from 'lucide-react'
import { Link } from 'react-router'

import { trpc } from '../trpc'

const COLUMNS = 5

export const Workflows = () => {
   const list = trpc.workflow.list.useQuery(undefined, { retry: false })

   return (
      <div className="grid w-full gap-4 px-4 lg:px-6">
         <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
               <h2 className="text-lg font-semibold">Workflows</h2>
               <p className="text-muted-foreground text-sm">
                  Each workflow finds people who show interest, scores them against your ideal customer and keeps the
                  best in its list.
               </p>
            </div>
            <Button asChild>
               <Link to="/workflows/new">
                  <Plus />
                  New workflow
               </Link>
            </Button>
         </div>
         <div className="overflow-hidden rounded-lg border">
            <Table>
               <TableHeader className="bg-muted/50">
                  <TableRow>
                     <TableHead>Workflow</TableHead>
                     <TableHead>Runs</TableHead>
                     <TableHead>Last run</TableHead>
                     <TableHead>List</TableHead>
                     <TableHead>Started</TableHead>
                  </TableRow>
               </TableHeader>
               <TableBody>
                  <StateRows
                     loading={list.isPending}
                     error={list.error?.message}
                     empty={list.data?.length === 0}
                     columns={COLUMNS}
                     emptyIcon={WorkflowIcon}
                     emptyText="No workflows yet. Use New workflow to set one up in three steps."
                  />
                  {list.data?.map(workflow => {
                     const [last] = workflow.runs
                     const scheduled = workflow.graph.nodes.some(({ type }) => type === 'trigger.schedule')

                     return (
                        <TableRow key={workflow.id}>
                           <TableCell>
                              <Link
                                 to={`/workflows/${workflow.id}`}
                                 className="font-medium underline-offset-4 hover:underline"
                              >
                                 {workflow.name}
                              </Link>
                              {workflow.goal ? (
                                 <p className="text-muted-foreground text-xs">{workflow.goal}</p>
                              ) : null}
                           </TableCell>
                           <TableCell>
                              {scheduled ? (workflow.enabled ? 'On its schedule' : 'Schedule switched off') : 'By hand'}
                           </TableCell>
                           <TableCell>{last ? <RunStatusBadge status={last.status} /> : '–'}</TableCell>
                           <TableCell>{workflow.outputList.name}</TableCell>
                           <TableCell className="text-muted-foreground">
                              {last ? new Date(last.startedAt).toLocaleString() : '–'}
                           </TableCell>
                        </TableRow>
                     )
                  })}
               </TableBody>
            </Table>
         </div>
      </div>
   )
}
