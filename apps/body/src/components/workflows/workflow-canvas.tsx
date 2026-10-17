import {
   Background,
   Controls,
   type Edge,
   type EdgeChange,
   MiniMap,
   type NodeChange,
   ReactFlow,
   ReactFlowProvider,
   addEdge,
   applyEdgeChanges,
   applyNodeChanges,
   useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Loader2, Save } from 'lucide-react'
import { type DragEvent, useDeferredValue, useMemo, useState } from 'react'

import { trpc } from '../../trpc'
import { BlockNode } from './block-node'
import { type FlowNode, blockOf, canConnect, newNodeId, toFlow, toGraph } from './graph-convert'
import { DRAG_TYPE, Palette } from './palette'
import { SettingsPanel } from './settings-panel'
import { type Block, type ConfigValue, type Graph, type StepRun, formatUsd } from './types'

const NODE_TYPES = { block: BlockNode }

type Props = {
   workflowId: string
   graph: Graph
   catalog: Block[]
   icps: { id: string; name: string }[]
   // The owner's other workflows, for "After another workflow".
   workflows: { id: string; name: string }[]
   // A run to show on the canvas: each block's state and what passed along each line.
   replay: StepRun[] | null
   saving: boolean
   saveError: { message: string } | null
   onSave: (graph: Graph) => void
}

const Editor = ({ workflowId, graph, catalog, icps, workflows, replay, saving, saveError, onSave }: Props) => {
   const { screenToFlowPosition } = useReactFlow()
   const icpNames = useMemo(() => new Map(icps.map(icp => [icp.id, icp.name])), [icps])
   const initial = useMemo(() => toFlow(graph, catalog, { icpNames }), [graph, catalog, icpNames])
   const [nodes, setNodes] = useState<FlowNode[]>(initial.nodes)
   const [edges, setEdges] = useState<Edge[]>(initial.edges)
   const [selectedId, setSelectedId] = useState<string | null>(null)
   const [dirty, setDirty] = useState(false)

   const draft = useMemo(() => toGraph(nodes, edges), [nodes, edges])
   const deferred = useDeferredValue(draft)
   const estimate = trpc.workflow.estimate.useQuery(
      {
         id: workflowId,
         graph: deferred,
      },
      { placeholderData: previous => previous }
   )
   const problems = estimate.data?.problems ?? []
   const invalid = new Set(problems.flatMap(({ nodeId }) => (nodeId ? [nodeId] : [])))

   // The replay and the problems are drawn on top of the editable nodes.
   const shown = toFlow(draft, catalog, {
      steps: replay ?? undefined,
      invalid,
      icpNames,
   })

   const change = (update: () => void) => {
      update()
      setDirty(true)
   }

   const add = (block: Block, position = { x: 80 + nodes.length * 30, y: 80 + nodes.length * 30 }) =>
      change(() => {
         const id = newNodeId(block.type, nodes)

         setNodes(current => [
            ...current,
            {
               id,
               type: 'block',
               position,
               data: {
                  block,
                  config: {},
                  step: null,
                  invalid: false,
               },
            },
         ])
         setSelectedId(id)
      })

   const onDrop = (event: DragEvent) => {
      event.preventDefault()

      const block = blockOf(catalog, event.dataTransfer.getData(DRAG_TYPE))

      if (block) {
         add(
            block,
            screenToFlowPosition({
               x: event.clientX,
               y: event.clientY,
            })
         )
      }
   }

   const setConfig = (key: string, value: ConfigValue) =>
      change(() =>
         setNodes(current =>
            current.map(node =>
               node.id === selectedId ? { ...node, data: { ...node.data, config: { ...node.data.config, [key]: value } } } : node
            )
         )
      )

   const remove = () =>
      change(() => {
         setNodes(current => current.filter(({ id }) => id !== selectedId))
         setEdges(current => current.filter(({ source, target }) => source !== selectedId && target !== selectedId))
         setSelectedId(null)
      })

   const selected = nodes.find(({ id }) => id === selectedId) ?? null

   return (
      <div className="grid gap-3">
         <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
               Data cost up to <span className="font-medium">{formatUsd(estimate.data?.totalMicros ?? 0)}</span> a run
               {estimate.data ? ` (${estimate.data.posts} posts waiting)` : ''}
            </p>
            <Button disabled={!dirty || saving} onClick={() => onSave(draft)}>
               {saving ? <Loader2 className="animate-spin" /> : <Save />}
               Save changes
            </Button>
         </div>
         {problems.length > 0 ? (
            <Alert>
               <AlertTitle>Before this workflow can run</AlertTitle>
               <AlertDescription>
                  <ul className="list-disc pl-5">
                     {problems.map(problem => (
                        <li key={`${problem.nodeId ?? ''}${problem.message}`}>{problem.message}</li>
                     ))}
                  </ul>
               </AlertDescription>
            </Alert>
         ) : null}
         {saveError ? <p className="text-destructive text-sm">{saveError.message}</p> : null}
         <div className="grid h-[640px] grid-cols-[200px_1fr_280px] overflow-hidden rounded-lg border">
            <div className="border-r">
               <Palette catalog={catalog} onAdd={block => add(block)} />
            </div>
            <div onDragOver={event => event.preventDefault()} onDrop={onDrop}>
               <ReactFlow<FlowNode>
                  nodes={shown.nodes.map(node => ({
                     ...node,
                     measured: nodes.find(({ id }) => id === node.id)?.measured,
                     selected: node.id === selectedId,
                  }))}
                  edges={shown.edges.map(edge => ({
                     ...edge,
                     selected: edges.find(({ id }) => id === edge.id)?.selected,
                  }))}
                  nodeTypes={NODE_TYPES}
                  onNodesChange={(changes: NodeChange<FlowNode>[]) => {
                     setNodes(current => applyNodeChanges(changes, current))

                     if (changes.some(({ type }) => type === 'position' || type === 'remove')) {
                        setDirty(true)
                     }
                  }}
                  onEdgesChange={(changes: EdgeChange[]) => {
                     setEdges(current => applyEdgeChanges(changes, current))

                     if (changes.some(({ type }) => type === 'remove')) {
                        setDirty(true)
                     }
                  }}
                  isValidConnection={({ source, target }) => canConnect(nodes, edges, source, target)}
                  onConnect={connection =>
                     change(() => setEdges(current => addEdge({ ...connection, id: `${connection.source}>${connection.target}` }, current)))
                  }
                  onNodeClick={(_, node) => setSelectedId(node.id)}
                  onPaneClick={() => setSelectedId(null)}
                  fitView
               >
                  <Background />
                  <Controls />
                  <MiniMap pannable zoomable />
               </ReactFlow>
            </div>
            <div className="overflow-y-auto border-l">
               <SettingsPanel
                  node={selected}
                  icps={icps}
                  workflows={workflows.filter(({ id }) => id !== workflowId)}
                  onChange={setConfig}
                  onRemove={remove}
               />
            </div>
         </div>
      </div>
   )
}

// The workflow as a graph of blocks (React Flow). It edits a draft; nothing is saved until Save changes.
export const WorkflowCanvas = (props: Props) => (
   <ReactFlowProvider>
      <Editor {...props} />
   </ReactFlowProvider>
)
