import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Download, Eye, Wrench } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { cn } from '@/lib/utils'

import {
   type Block,
   type Run,
   type RunDetail,
   formatUsd,
   resumeText,
   runStatuses,
   stepLabel,
   triggerLabels,
} from './types'

import { BlockOutput } from './block-output'
import { blockOf, combineRounds } from './graph-convert'
import { runSentence } from './run-sentence'

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
                  <TableCell>{run.kind === 'HOOK' ? 'Hook' : triggerLabels[run.trigger]}</TableCell>
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
   onOpenBlock: (nodeId: string) => void
   // Stops a live hook run on its own; the main run has its Stop above the tabs.
   onStop?: (runId: string) => void
}

// One run step by step: how many went in and out of each block, the pass rate, what each block cost, and what it
// passed on.
export const RunDetailView = ({ run, catalog, onOpenBlock, onStop }: DetailProps) => {
   const [shownNode, setShownNode] = useState<string | null>(null)
   const order = run.graph.nodes.map(({ id }) => id)
   const combined = combineRounds(run.steps)
   const steps = [...combined.values()].sort((a, b) => order.indexOf(a.nodeId) - order.indexOf(b.nodeId))
   const shownStep = shownNode ? combined.get(shownNode) : undefined
   const perQualified = run.qualified > 0 ? formatUsd(Math.round(run.costMicros / run.qualified)) : '–'

   return (
      <div className="grid gap-3 rounded-lg border p-4">
         <p className="text-sm font-medium">{runSentence(run, type => blockOf(catalog, type)?.label ?? type)}</p>
         <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-sm">
            <RunStatusBadge status={run.status} />
            <span>{run.kind === 'HOOK' ? 'Hook' : triggerLabels[run.trigger]}</span>
            {run.kind === 'HOOK' && run.status === 'RUNNING' && !run.stopRequestedAt && onStop ? (
               <Button variant="outline" size="sm" onClick={() => onStop(run.id)}>
                  Stop this hook run
               </Button>
            ) : null}
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
         {run.message && run.status !== 'FAILED' ? <p className="text-destructive text-sm">{run.message}</p> : null}
         {run.parent ? (
            <p className="text-muted-foreground text-sm">
               {run.kind === 'HOOK' ? 'A hook of ' : 'Started by '}
               <Link className="underline" to={`/workflows/${run.parent.workflowId}?run=${run.parent.runId}`}>
                  {run.kind === 'HOOK' ? 'this run' : `a run of "${run.parent.workflowName}"`}
               </Link>
               .
            </p>
         ) : null}
         {run.hooks.length > 0 ? (
            <div className="grid gap-1 text-sm">
               <p className="font-medium">Hooks</p>
               <ul className="text-muted-foreground grid gap-0.5">
                  {run.hooks.map(hook => (
                     <li key={`${hook.nodeId}:${hook.phase}`}>
                        {blockOf(catalog, run.graph.nodes.find(({ id }) => id === hook.nodeId)?.type ?? '')?.label ??
                           hook.nodeId}
                        , {hook.phase}: {hook.fired} started
                        {hook.running > 0 ? `, ${hook.running} still running` : ''}
                        {hook.failed > 0 ? `, ${hook.failed} failed${hook.reason ? ` (${hook.reason})` : ''}` : ''}
                        {hook.skipped > 0 ? `, ${hook.skipped} did not start${hook.reason ? ` (${hook.reason})` : ''}` : ''}
                        {hook.firstRunId ? (
                           <>
                              {' '}
                              <Link className="underline" to={`/workflows/${run.workflowId}?run=${hook.firstRunId}`}>
                                 Open
                              </Link>
                           </>
                        ) : null}
                     </li>
                  ))}
               </ul>
            </div>
         ) : null}
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
                  <TableHead className="w-56" />
               </TableRow>
            </TableHeader>
            <TableBody>
               {steps.map(step => (
                  <TableRow key={step.nodeId}>
                     <TableCell>
                        {blockOf(catalog, step.type)?.label ?? step.type}
                        {step.round > 0 ? (
                           <span className="text-muted-foreground text-xs"> · {step.round + 1} rounds</span>
                        ) : null}
                     </TableCell>
                     <TableCell>{stepLabel(step)}</TableCell>
                     <TableCell>{step.itemsIn}</TableCell>
                     <TableCell>{step.itemsOut}</TableCell>
                     <TableCell>{percent(step.itemsOut, step.itemsIn)}</TableCell>
                     <TableCell>{step.costMicros > 0 ? formatUsd(step.costMicros) : '–'}</TableCell>
                     <TableCell className="text-muted-foreground text-xs">
                        {step.message}
                        {step.status === 'WAITING' ? resumeText(step.waitUntil) : null}
                        {step.child ? (
                           <>
                              {' '}
                              <Link
                                 className="underline"
                                 to={`/workflows/${step.child.workflowId}?run=${step.child.runId}`}
                              >
                                 Open its run
                              </Link>
                           </>
                        ) : null}
                     </TableCell>
                     <TableCell>
                        <div className="flex justify-end gap-1">
                           {step.status === 'FAILED' || step.status === 'PARTIAL' ? (
                              <Button variant="outline" size="sm" onClick={() => onOpenBlock(step.nodeId)}>
                                 <Wrench />
                                 Why, and what to do
                              </Button>
                           ) : null}
                           <Button variant="outline" size="sm" onClick={() => setShownNode(step.nodeId)}>
                              {step.type === 'output.csv' ? <Download /> : <Eye />}
                              {step.type === 'output.csv' ? 'CSV' : 'Output'}
                           </Button>
                        </div>
                     </TableCell>
                  </TableRow>
               ))}
            </TableBody>
         </Table>
         <Dialog open={Boolean(shownStep)} onOpenChange={open => (open ? undefined : setShownNode(null))}>
            <DialogContent className="sm:max-w-3xl">
               <DialogHeader>
                  <DialogTitle>
                     {shownStep ? (blockOf(catalog, shownStep.type)?.label ?? shownStep.type) : ''}: what it passed on
                  </DialogTitle>
                  <DialogDescription>
                     Kept 14 days; what reached an Export to CSV block is kept 90 days.
                  </DialogDescription>
               </DialogHeader>
               {shownStep ? (
                  <BlockOutput runId={run.id} nodeId={shownStep.nodeId} rounds={shownStep.round + 1} />
               ) : null}
            </DialogContent>
         </Dialog>
      </div>
   )
}
