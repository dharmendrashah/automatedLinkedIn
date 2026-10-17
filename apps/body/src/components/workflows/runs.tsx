import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Eye } from 'lucide-react'

import { cn } from '@/lib/utils'

import { type Block, type Run, type RunDetail, formatUsd, runStatuses, triggerLabels } from './types'

import { blockOf } from './graph-convert'

const formatTime = (value: string) => new Date(value).toLocaleString()

export const RunStatusBadge = ({ status }: { status: Run['status'] }) => (
   <Badge variant="outline" className={cn('border-transparent', runStatuses[status].className)}>
      {runStatuses[status].label}
   </Badge>
)

type ListProps = {
   runs: Run[] | undefined
   selectedId: string | null
   onSelect: (run: Run) => void
}

export const RunsTable = ({ runs, selectedId, onSelect }: ListProps) => (
   <div className="overflow-hidden rounded-lg border">
      <Table>
         <TableHeader className="bg-muted/50">
            <TableRow>
               <TableHead>Started</TableHead>
               <TableHead>How</TableHead>
               <TableHead>Status</TableHead>
               <TableHead>Qualified</TableHead>
               <TableHead>Maybe</TableHead>
               <TableHead>Left out</TableHead>
               <TableHead>Data cost</TableHead>
               <TableHead className="w-16" />
            </TableRow>
         </TableHeader>
         <TableBody>
            {runs?.length === 0 ? (
               <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground h-20 text-center text-sm">
                     No runs yet. Run a preview first to see what a run finds and costs.
                  </TableCell>
               </TableRow>
            ) : null}
            {runs?.map(run => (
               <TableRow key={run.id} className={cn(run.id === selectedId && 'bg-muted/50')}>
                  <TableCell>{formatTime(run.startedAt)}</TableCell>
                  <TableCell>{triggerLabels[run.trigger]}</TableCell>
                  <TableCell>
                     <RunStatusBadge status={run.status} />
                  </TableCell>
                  <TableCell>{run.qualified}</TableCell>
                  <TableCell>{run.maybe}</TableCell>
                  <TableCell>{run.discarded}</TableCell>
                  <TableCell>{formatUsd(run.costMicros)}</TableCell>
                  <TableCell>
                     <Button variant="ghost" size="icon" aria-label="Show this run" onClick={() => onSelect(run)}>
                        <Eye />
                     </Button>
                  </TableCell>
               </TableRow>
            ))}
         </TableBody>
      </Table>
   </div>
)

const percent = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '–')

type DetailProps = {
   run: RunDetail
   catalog: Block[]
}

// One run step by step: how many went in and out of each block, the pass rate, and what each block cost.
export const RunDetailView = ({ run, catalog }: DetailProps) => {
   const order = run.graph.nodes.map(({ id }) => id)
   const steps = [...run.steps].sort((a, b) => order.indexOf(a.nodeId) - order.indexOf(b.nodeId))
   const perQualified = run.qualified > 0 ? formatUsd(Math.round(run.costMicros / run.qualified)) : '–'

   return (
      <div className="grid gap-3 rounded-lg border p-4">
         <div className="flex flex-wrap items-center gap-3 text-sm">
            <RunStatusBadge status={run.status} />
            <span>{triggerLabels[run.trigger]}</span>
            <span>
               Data cost {formatUsd(run.costMicros)} of up to {formatUsd(run.estimateMicros)}
            </span>
            <span>
               {run.qualified} qualified, {run.maybe} maybe, {run.discarded} left out
            </span>
            <span>Cost per qualified person: {perQualified}</span>
         </div>
         {run.trigger === 'PREVIEW' ? (
            <p className="text-muted-foreground text-sm">
               A preview runs on one post and at most 20 people per block. Its numbers are a sample estimate; nobody was
               added to the list.
            </p>
         ) : null}
         {run.message ? <p className="text-destructive text-sm">{run.message}</p> : null}
         <Table>
            <TableHeader>
               <TableRow>
                  <TableHead>Block</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>In</TableHead>
                  <TableHead>Out</TableHead>
                  <TableHead>Passed</TableHead>
                  <TableHead>Data cost</TableHead>
                  <TableHead>Note</TableHead>
               </TableRow>
            </TableHeader>
            <TableBody>
               {steps.map(step => (
                  <TableRow key={step.nodeId}>
                     <TableCell>{blockOf(catalog, step.type)?.label ?? step.type}</TableCell>
                     <TableCell>{step.status.toLowerCase()}</TableCell>
                     <TableCell>{step.itemsIn}</TableCell>
                     <TableCell>{step.itemsOut}</TableCell>
                     <TableCell>{percent(step.itemsOut, step.itemsIn)}</TableCell>
                     <TableCell>{step.costMicros > 0 ? formatUsd(step.costMicros) : '–'}</TableCell>
                     <TableCell className="text-muted-foreground text-xs">{step.message}</TableCell>
                  </TableRow>
               ))}
            </TableBody>
         </Table>
      </div>
   )
}
