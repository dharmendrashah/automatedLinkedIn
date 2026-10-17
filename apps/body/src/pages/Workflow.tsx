import { RunDialog } from '@/components/workflows/run-dialog'
import { RunDetailView, RunsTable } from '@/components/workflows/runs'
import { WorkflowSettings } from '@/components/workflows/workflow-settings'
import { WorkflowCanvas } from '@/components/workflows/workflow-canvas'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { readableError } from '@/lib/trpc-error'
import { FlaskConical, Play } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { trpc } from '../trpc'

const POLL_MS = 3_000

export const WorkflowPage = () => {
   const { id = '' } = useParams()
   const utils = trpc.useUtils()
   const [tab, setTab] = useState('canvas')
   const [mode, setMode] = useState<'preview' | 'run' | null>(null)
   const [runId, setRunId] = useState<string | null>(null)
   const [replay, setReplay] = useState(false)

   const workflow = trpc.workflow.get.useQuery({ id }, { retry: false })
   const catalog = trpc.workflow.catalog.useQuery()
   const icps = trpc.icp.list.useQuery()
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

   const refresh = () => {
      void utils.workflow.get.invalidate({ id })
      void utils.workflow.list.invalidate()
   }
   const update = trpc.workflow.update.useMutation({ onSuccess: refresh })

   if (workflow.error) {
      return <p className="text-destructive px-4 lg:px-6">{workflow.error.message}</p>
   }

   if (!workflow.data || !catalog.data) {
      return <p className="text-muted-foreground px-4 lg:px-6">Loading…</p>
   }

   const { data } = workflow
   const scheduled = data.graph.nodes.some(({ type }) => type === 'trigger.schedule')

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
               {scheduled ? (
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
                     <Label htmlFor="workflow-on">Runs on its schedule</Label>
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

         <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
               <TabsTrigger value="canvas">Canvas</TabsTrigger>
               <TabsTrigger value="runs">Runs</TabsTrigger>
               <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
            <TabsContent value="canvas" className="grid gap-3">
               {detail.data ? (
                  <div className="flex items-center gap-2 text-sm">
                     <Checkbox id="replay" checked={replay} onCheckedChange={checked => setReplay(checked === true)} />
                     <Label htmlFor="replay">Show the last run on the canvas</Label>
                  </div>
               ) : null}
               <WorkflowCanvas
                  key={data.updatedAt}
                  graph={data.graph}
                  catalog={catalog.data}
                  icps={icps.data ?? []}
                  replay={replay && detail.data ? detail.data.steps : null}
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
               {detail.data ? <RunDetailView run={detail.data} catalog={catalog.data} /> : null}
            </TabsContent>
            <TabsContent value="settings">
               <WorkflowSettings workflow={data} />
            </TabsContent>
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
      </div>
   )
}
