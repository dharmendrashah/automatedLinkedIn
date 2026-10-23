import { ApiAccess } from '@/components/workflows/api-access'
import { RunDialog } from '@/components/workflows/run-dialog'
import { runSentence } from '@/components/workflows/run-sentence'
import { RunDetailView, RunsTable } from '@/components/workflows/runs'
import { WorkflowSettings } from '@/components/workflows/workflow-settings'
import { WorkflowCanvas } from '@/components/workflows/workflow-canvas'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { readableError } from '@/lib/trpc-error'
import { useDocumentTitle } from '@/lib/page-title'
import { FlaskConical, Loader2, Play, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { trpc } from '../trpc'

const POLL_MS = 3_000

export const WorkflowPage = () => {
   const { id = '' } = useParams()
   // A link from another run opens this run on the Runs tab.
   const [params] = useSearchParams()
   const linkedRun = params.get('run')
   const utils = trpc.useUtils()
   const navigate = useNavigate()
   const [tab, setTab] = useState(linkedRun ? 'runs' : 'canvas')
   const [mode, setMode] = useState<'preview' | 'run' | null>(null)
   const [runId, setRunId] = useState<string | null>(linkedRun)
   const [replay, setReplay] = useState(false)
   const [focus, setFocus] = useState<string | null>(null)
   const [stopping, setStopping] = useState(false)

   const workflow = trpc.workflow.get.useQuery({ id }, { retry: false })
   // The tab and a bookmark carry the workflow's own name, which the owner chose.
   useDocumentTitle(workflow.data?.name)
   const catalog = trpc.workflow.catalog.useQuery()
   const icps = trpc.icp.list.useQuery()
   const workflows = trpc.workflow.list.useQuery()
   const runs = trpc.workflow.runs.useQuery(
      { workflowId: id },
      { refetchInterval: query => (query.state.data?.some(run => run.status === 'RUNNING') ? POLL_MS : false) }
   )
   const shownRunId = runId ?? runs.data?.[0]?.id ?? null
   const detail = trpc.workflow.runDetail.useQuery(
      { runId: shownRunId ?? '' },
      {
         enabled: Boolean(shownRunId),
         refetchInterval: query => (query.state.data?.status === 'RUNNING' ? POLL_MS : false),
      }
   )
   // The live run stays in view even while an older run is picked on the Runs tab.
   const latestRunning = runs.data?.find(run => run.status === 'RUNNING')
   const liveDetail = trpc.workflow.runDetail.useQuery(
      { runId: latestRunning?.id ?? '' },
      {
         enabled: Boolean(latestRunning) && latestRunning?.id !== shownRunId,
         refetchInterval: POLL_MS,
      }
   )

   const refresh = () => {
      void utils.workflow.get.invalidate({ id })
      void utils.workflow.list.invalidate()
   }
   const update = trpc.workflow.update.useMutation({ onSuccess: refresh })
   const stopRun = trpc.workflow.stopRun.useMutation({
      onSuccess: () => {
         void utils.workflow.runDetail.invalidate()
         void utils.workflow.runs.invalidate({ workflowId: id })
      },
      onError: error => {
         toast.error(readableError(error))
      },
   })
   const labelOf = (type: string) => catalog.data?.find(block => block.type === type)?.label ?? type

   // The newest run that ends while the page is open says how it went.
   const newest = runs.data?.[0]
   const lastStatus = useRef(newest?.status)

   useEffect(() => {
      if (newest && lastStatus.current === 'RUNNING' && newest.status !== 'RUNNING') {
         const found = newest.qualified + newest.maybe > 0

         toast(runSentence({ ...newest, steps: [] }, labelOf), {
            duration: 15_000,
            action: {
               label: found ? 'See the people' : 'Open the run',
               onClick: () => {
                  if (found) {
                     navigate('/lists')
                  } else {
                     setRunId(newest.id)
                     setTab('runs')
                  }
               },
            },
         })
      }

      lastStatus.current = newest?.status
      // Only a change of the newest run's state matters.
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [newest?.id, newest?.status])

   if (workflow.error) {
      return <p className="text-destructive px-4 lg:px-6">{workflow.error.message}</p>
   }

   if (!workflow.data || !catalog.data) {
      return <p className="text-muted-foreground px-4 lg:px-6">Loading…</p>
   }

   const { data } = workflow
   const triggers = new Set(data.graph.nodes.map(({ type }) => type))
   const onLabel = [
      triggers.has('trigger.schedule') ? 'on its schedule' : null,
      triggers.has('trigger.api') ? 'when called' : null,
      triggers.has('trigger.workflow') ? 'after the workflow it listens to' : null,
   ].filter(Boolean)
   const api = triggers.has('trigger.api')
   const live = detail.data?.status === 'RUNNING' ? detail.data : liveDetail.data?.status === 'RUNNING' ? liveDetail.data : null
   const [latest] = runs.data ?? []
   const attention = latest?.status === 'FAILED' || latest?.status === 'PARTIAL'

   return (
      <div className="grid w-full gap-4 px-4 lg:px-6">
         <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
               <h2 className="text-lg font-semibold">{data.name}</h2>
               <p className="text-muted-foreground text-sm">
                  Adds people to the list{' '}
                  <Link to="/lists" className="underline underline-offset-4">
                     {data.outputList.name}
                  </Link>
                  {data.nextRunAt ? `. Next run ${new Date(data.nextRunAt).toLocaleString()}.` : '.'}
               </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
               {onLabel.length > 0 ? (
                  <div className="flex items-center gap-2">
                     <Checkbox
                        id="workflow-on"
                        checked={data.enabled}
                        disabled={update.isPending}
                        onCheckedChange={checked =>
                           update.mutate({
                              id,
                              enabled: checked === true,
                           })
                        }
                     />
                     <Label htmlFor="workflow-on">Runs {onLabel.join(' and ')}</Label>
                  </div>
               ) : null}
               <Button variant="outline" onClick={() => setMode('preview')}>
                  <FlaskConical />
                  Run a preview
               </Button>
               <Button onClick={() => setMode('run')}>
                  <Play />
                  Run now
               </Button>
            </div>
         </div>

         {update.error ? <p className="text-destructive text-sm">{readableError(update.error)}</p> : null}

         {live ? (
            <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
               <span className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {runSentence(live, labelOf)}
               </span>
               {live.stopRequestedAt ? null : (
                  <Button variant="outline" size="sm" onClick={() => setStopping(true)}>
                     <Square />
                     Stop run
                  </Button>
               )}
            </div>
         ) : null}

         <Tabs
            value={tab}
            onValueChange={next => {
               setTab(next)
               setFocus(null)
            }}
         >
            <TabsList>
               <TabsTrigger value="canvas">Canvas</TabsTrigger>
               <TabsTrigger value="runs">
                  Runs
                  {latest?.status === 'RUNNING' ? (
                     <span className="bg-primary size-2 rounded-full" aria-label="A run is live" />
                  ) : latest?.status === 'FAILED' ? (
                     <span className="bg-destructive size-2 rounded-full" aria-label="The last run failed" />
                  ) : attention ? (
                     <span className="bg-warning size-2 rounded-full" aria-label="The last run has gaps" />
                  ) : null}
               </TabsTrigger>
               <TabsTrigger value="settings">Settings</TabsTrigger>
               {api ? <TabsTrigger value="api">API</TabsTrigger> : null}
            </TabsList>
            <TabsContent value="canvas" className="grid gap-3">
               {detail.data && !live ? (
                  <div className="flex items-center gap-2 text-sm">
                     <Checkbox id="replay" checked={replay} onCheckedChange={checked => setReplay(checked === true)} />
                     <Label htmlFor="replay">Show the last run on the canvas</Label>
                  </div>
               ) : null}
               {live ? (
                  <p className="text-muted-foreground text-sm">
                     Showing the live run. It uses the workflow as it was when it started; edits apply to the next run.
                  </p>
               ) : null}
               <WorkflowCanvas
                  key={data.updatedAt}
                  workflowId={id}
                  graph={data.graph}
                  catalog={catalog.data}
                  icps={icps.data ?? []}
                  workflows={workflows.data ?? []}
                  replay={live ? live.steps : replay && detail.data ? detail.data.steps : null}
                  replayRunId={live ? live.id : replay && detail.data ? detail.data.id : null}
                  focus={focus}
                  saving={update.isPending}
                  saveError={update.error}
                  onSave={graph =>
                     update.mutate({
                        id,
                        graph,
                     })
                  }
               />
            </TabsContent>
            <TabsContent value="runs" className="grid gap-3">
               <RunsTable runs={runs.data} selectedId={shownRunId} onSelect={run => setRunId(run.id)} />
               {detail.data ? (
                  <RunDetailView
                     run={detail.data}
                     catalog={catalog.data}
                     onOpenBlock={nodeId => {
                        setReplay(true)
                        setTab('canvas')
                        setFocus(nodeId)
                     }}
                  />
               ) : null}
            </TabsContent>
            <TabsContent value="settings">
               <WorkflowSettings workflow={data} />
            </TabsContent>
            {api ? (
               <TabsContent value="api">
                  <ApiAccess workflowId={id} enabled={data.enabled} graph={data.graph} />
               </TabsContent>
            ) : null}
         </Tabs>

         <RunDialog
            workflowId={id}
            mode={mode}
            onClose={() => setMode(null)}
            onStarted={started => {
               setRunId(started)
               setTab('runs')
               void utils.workflow.runs.invalidate({ workflowId: id })
            }}
         />

         <AlertDialog open={stopping} onOpenChange={setStopping}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Stop this run?</AlertDialogTitle>
                  <AlertDialogDescription>
                     Nothing new is paid for. Requests already paid for finish first, and what they find is kept, so the
                     cost shown is what was really charged. People found so far stay in the list.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel>Keep running</AlertDialogCancel>
                  <AlertDialogAction onClick={() => (live ? stopRun.mutate({ runId: live.id }) : undefined)}>
                     Stop run
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </div>
   )
}
