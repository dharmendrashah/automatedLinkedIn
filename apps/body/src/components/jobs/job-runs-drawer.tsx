import { floatingDrawer } from '@/components/floating-drawer'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDuration } from '@/components/sessions/describe'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import { trpc } from '../../trpc'
import { ITEM_RESULT, OUTCOME, STORED, actionLabel, countsText, itemResultLabel, summariseItems, whenText } from './describe'
import { ToneBadge } from './tone-badge'
import { type Job } from './types'

const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })

const RunDetailView = ({ id, onBack }: { id: string; onBack: () => void }) => {
   const detail = trpc.jobs.run.useQuery({ id }, { retry: false })
   const run = detail.data

   return (
      <div className="grid gap-4 overflow-y-auto p-5">
         <Button variant="ghost" size="sm" className="justify-self-start" onClick={onBack}>
            <ArrowLeft />
            Back to the runs
         </Button>
         {detail.isPending ? <Skeleton className="h-24 w-full" /> : null}
         {detail.error ? <p className="text-destructive text-sm">{detail.error.message}</p> : null}
         {run ? (
            <>
               <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Result</dt>
                  <dd>
                     <ToneBadge tone={OUTCOME[run.outcome].tone}>{OUTCOME[run.outcome].label}</ToneBadge>
                  </dd>
                  <dt className="text-muted-foreground">Started</dt>
                  <dd>{when(run.startedAt)}</dd>
                  <dt className="text-muted-foreground">Took</dt>
                  <dd>{formatDuration(run.durationMs)}</dd>
                  <dt className="text-muted-foreground">Summary</dt>
                  <dd>{run.summary ?? 'Nothing was asked for.'}</dd>
                  {Object.keys(run.counts).length > 0 ? (
                     <>
                        <dt className="text-muted-foreground">Numbers</dt>
                        <dd>{countsText(run.counts)}</dd>
                     </>
                  ) : null}
                  <dt className="text-muted-foreground">Worker</dt>
                  <dd className="break-all">
                     {run.instance} · build {run.build}
                  </dd>
               </dl>
               {run.error ? (
                  <p className="text-destructive rounded-md border p-3 text-sm break-words">{run.error}</p>
               ) : null}

               {run.items.length > 0 ? (
                  <section className="grid gap-2">
                     <h4 className="text-sm font-medium">What it handled</h4>
                     <ul className="text-sm">
                        {summariseItems(run.items).map(line => (
                           <li key={line.action}>
                              <span className="font-medium">{line.label}:</span> {line.text}
                           </li>
                        ))}
                     </ul>
                     <div className="overflow-hidden rounded-lg border">
                        <Table>
                           <TableHeader className="bg-muted/50">
                              <TableRow>
                                 <TableHead>User</TableHead>
                                 <TableHead>LinkedIn account</TableHead>
                                 <TableHead>What</TableHead>
                                 <TableHead>Result</TableHead>
                                 <TableHead>Why, or what came of it</TableHead>
                              </TableRow>
                           </TableHeader>
                           <TableBody>
                              {run.items.map(item => (
                                 <TableRow key={item.id}>
                                    <TableCell className="text-xs">{item.user ?? 'Deleted'}</TableCell>
                                    <TableCell className="text-xs">{item.account ?? 'Deleted'}</TableCell>
                                    <TableCell className="text-xs">{actionLabel(item.action)}</TableCell>
                                    <TableCell>
                                       <ToneBadge tone={ITEM_RESULT[item.result].tone}>
                                          {itemResultLabel(item.action, item.result)}
                                       </ToneBadge>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-xs">
                                       {item.reason ??
                                          (item.session
                                             ? [
                                                  item.session.verdict ?? item.session.status.toLowerCase(),
                                                  item.session.stored ? STORED[item.session.stored] : null,
                                                  item.session.durationMs === null
                                                     ? null
                                                     : formatDuration(item.session.durationMs),
                                               ]
                                                  .filter(Boolean)
                                                  .join(' · ')
                                             : '')}
                                    </TableCell>
                                 </TableRow>
                              ))}
                           </TableBody>
                        </Table>
                     </div>
                  </section>
               ) : null}
            </>
         ) : null}
      </div>
   )
}

type Props = {
   job: Job | null
   now: number
   onClose: () => void
}

// The runs of one job, newest first; idle runs are hidden until asked for, because a 5 second job has thousands a day.
export const JobRunsDrawer = ({ job, now, onClose }: Props) => {
   const [includeIdle, setIncludeIdle] = useState(false)
   const [before, setBefore] = useState<string | undefined>()
   const [runId, setRunId] = useState<string | null>(null)
   const runs = trpc.jobs.runs.useQuery(
      {
         job: job?.name ?? '',
         includeIdle,
         before,
      },
      {
         enabled: Boolean(job),
         retry: false,
      }
   )

   const close = () => {
      setRunId(null)
      setBefore(undefined)
      onClose()
   }

   return (
      <Drawer open={Boolean(job)} onOpenChange={open => (open ? undefined : close())} direction="right">
         <DrawerContent className={floatingDrawer('data-[vaul-drawer-direction=right]:sm:max-w-3xl')}>
            <DrawerHeader className="border-b px-5 py-4">
               <DrawerTitle className="text-base">{job?.title}</DrawerTitle>
               <DrawerDescription>{job?.purpose}</DrawerDescription>
            </DrawerHeader>
            {runId ? (
               <RunDetailView id={runId} onBack={() => setRunId(null)} />
            ) : (
               <div className="grid gap-3 overflow-y-auto p-5">
                  <div className="flex items-center gap-2">
                     <Checkbox
                        id="include-idle"
                        checked={includeIdle}
                        onCheckedChange={checked => {
                           setIncludeIdle(checked === true)
                           setBefore(undefined)
                        }}
                     />
                     <Label htmlFor="include-idle" className="text-sm font-normal">
                        Show the runs that had nothing to do
                     </Label>
                  </div>
                  {runs.isPending ? <Skeleton className="h-24 w-full" /> : null}
                  {runs.error ? <p className="text-destructive text-sm">{runs.error.message}</p> : null}
                  {runs.data?.runs.length === 0 ? (
                     <p className="text-muted-foreground text-sm">
                        {includeIdle ? 'No run was recorded.' : 'No run did work or failed in the time kept (30 days).'}
                     </p>
                  ) : null}
                  <ul className="grid gap-1">
                     {runs.data?.runs.map(run => (
                        <li key={run.id}>
                           <button
                              type="button"
                              className="hover:bg-muted/50 flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm"
                              onClick={() => setRunId(run.id)}
                           >
                              <ToneBadge tone={OUTCOME[run.outcome].tone}>{OUTCOME[run.outcome].label}</ToneBadge>
                              <span className="grid min-w-0 flex-1 gap-0.5">
                                 <span className="truncate">{run.summary ?? run.error ?? 'Nothing to do'}</span>
                                 <span className="text-muted-foreground text-xs">
                                    {when(run.startedAt)} · {whenText(run.startedAt, now)} · took{' '}
                                    {formatDuration(run.durationMs)}
                                    {run.items > 0 ? ` · ${run.items} accounts listed` : ''}
                                 </span>
                              </span>
                              <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                           </button>
                        </li>
                     ))}
                  </ul>
                  <div className="flex justify-between">
                     <Button variant="outline" size="sm" disabled={!before} onClick={() => setBefore(undefined)}>
                        Newest
                     </Button>
                     <Button
                        variant="outline"
                        size="sm"
                        disabled={!runs.data?.next}
                        onClick={() => setBefore(runs.data?.next ?? undefined)}
                     >
                        Older
                     </Button>
                  </div>
               </div>
            )}
         </DrawerContent>
      </Drawer>
   )
}
