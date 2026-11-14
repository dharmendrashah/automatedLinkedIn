import { StateRows } from '@/components/links/state-rows'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { isLive } from '@/components/workflows/run-sentence'
import {
   CampaignCell,
   CostCell,
   CountCell,
   Heading,
   LastRunCell,
   ScheduleCell,
   WorkflowCell,
} from '@/components/workflows/workflow-list-cells'
import { metricsOf } from '@/components/workflows/workflow-row'
import {
   CalendarClock,
   CircleHelp,
   History,
   Megaphone,
   Plus,
   UserCheck,
   Users,
   Wallet,
   Workflow as WorkflowIcon,
} from 'lucide-react'
import { Link } from 'react-router'

import { trpc } from '../trpc'

const COLUMNS = 8
const POLL_MS = 3_000

export const Workflows = () => {
   const list = trpc.workflow.list.useQuery(undefined, {
      retry: false,
      refetchInterval: query => (query.state.data?.some(({ runs }) => isLive(runs[0]?.status)) ? POLL_MS : false),
   })

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
         <div className="overflow-x-auto rounded-lg border">
            <Table>
               <TableHeader className="bg-muted/50">
                  <TableRow>
                     <TableHead>
                        <Heading icon={WorkflowIcon} label="Workflow" hint="The workflow and what it is for." />
                     </TableHead>
                     <TableHead>
                        <Heading
                           icon={Megaphone}
                           label="Campaign"
                           hint="The campaign this workflow belongs to and its step in it."
                        />
                     </TableHead>
                     <TableHead>
                        <Heading
                           icon={CalendarClock}
                           label="Schedule"
                           hint="On: it starts by itself. Off: its schedule is switched off. By hand: it only runs when you start it."
                        />
                     </TableHead>
                     <TableHead>
                        <Heading icon={History} label="Last run" hint="How its latest run ended and when it started." />
                     </TableHead>
                     <TableHead className="text-right">
                        <Heading
                           icon={Users}
                           label="Found"
                           hint="People the last run scored: qualified, maybe and the ones it left out."
                        />
                     </TableHead>
                     <TableHead className="text-right">
                        <Heading
                           icon={UserCheck}
                           label="Qualified"
                           hint="People who matched your ideal customer well enough to keep."
                        />
                     </TableHead>
                     <TableHead className="text-right">
                        <Heading
                           icon={CircleHelp}
                           label="Maybe"
                           hint="People who might match: close to the bar but not over it."
                        />
                     </TableHead>
                     <TableHead className="text-right">
                        <Heading
                           icon={Wallet}
                           label="Cost"
                           hint="What the last run cost, and what each qualified person cost."
                        />
                     </TableHead>
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
                     const { found, qualified, maybe } = metricsOf(last)

                     return (
                        <TableRow key={workflow.id}>
                           <TableCell>
                              <WorkflowCell workflow={workflow} />
                           </TableCell>
                           <TableCell>
                              <CampaignCell workflow={workflow} />
                           </TableCell>
                           <TableCell>
                              <ScheduleCell workflow={workflow} />
                           </TableCell>
                           <TableCell>
                              <LastRunCell run={last} />
                           </TableCell>
                           <TableCell className="text-right">
                              <CountCell value={found} />
                           </TableCell>
                           <TableCell className="text-right">
                              <CountCell value={qualified} tone="good" />
                           </TableCell>
                           <TableCell className="text-right">
                              <CountCell value={maybe} />
                           </TableCell>
                           <TableCell className="text-right">
                              <CostCell run={last} />
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
