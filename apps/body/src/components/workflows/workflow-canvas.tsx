import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
   Background,
   ConnectionMode,
   Controls,
   type Edge,
   type EdgeChange,
   MiniMap,
   type NodeChange,
   Panel,
   ReactFlow,
   ReactFlowProvider,
   addEdge,
   applyEdgeChanges,
   applyNodeChanges,
   useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { CircleAlert, Info, Keyboard, Loader2, Plus, Redo2, Save, Undo2 } from 'lucide-react'
import { useDeferredValue, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

import { type Block, type ConfigValue, type Graph, type StepRun, formatUsd } from './types'

import { trpc } from '../../trpc'
import { BlockNode } from './block-node'
import { BlockPicker } from './block-picker'
import { BlockSettings } from './block-settings'
import { CanvasActions } from './canvas-actions'
import {
   DEFAULT_LOOP_ROUNDS,
   type FlowNode,
   MAX_LOOP_ROUNDS,
   canConnect,
   hasLoop,
   newNodeId,
   startConfig,
   toFlow,
   toGraph,
} from './graph-convert'
import { type History, record, redo, startHistory, undo } from './history'
import { isLeftToRight, layoutTopToBottom, neighbourOf, placeBelow } from './layout'
import { SHORTCUT_HELP, shortcutOf } from './shortcuts'

const NODE_TYPES = { block: BlockNode }
const EDGE_OPTIONS = { type: 'smoothstep' }
const DUPLICATE_OFFSET = 40

type Props = {
   workflowId: string
   graph: Graph
   catalog: Block[]
   icps: { id: string; name: string }[]
   // The owner's other workflows, for "After another workflow".
   workflows: { id: string; name: string }[]
   // A run to show on the canvas: each block's state and what passed along each line.
   replay: StepRun[] | null
   // The run being shown, so a block's dialog can show what it passed on.
   replayRunId: string | null
   // A block to open on arrival, such as the one a run failed in.
   focus?: string | null
   saving: boolean
   saveError: { message: string } | null
   onSave: (graph: Graph) => void
}

type Canvas = { nodes: FlowNode[]; edges: Edge[] }

const Editor = ({
   workflowId,
   graph,
   catalog,
   icps,
   workflows,
   replay,
   replayRunId,
   focus = null,
   saving,
   saveError,
   onSave,
}: Props) => {
   const { screenToFlowPosition } = useReactFlow()
   const wrapper = useRef<HTMLDivElement>(null)
   const icpNames = useMemo(() => new Map(icps.map(icp => [icp.id, icp.name])), [icps])
   // A workflow saved left to right is shown top to bottom; it is stored that way only when saved.
   const [relaid] = useState(() => isLeftToRight(graph))
   const [history, setHistory] = useState<History<Canvas>>(() =>
      startHistory(toFlow(relaid ? layoutTopToBottom(graph) : graph, catalog, { icpNames }))
   )
   const [dirty, setDirty] = useState(relaid)
   const [selectedId, setSelectedId] = useState<string | null>(focus)
   const [openId, setOpenId] = useState<string | null>(focus)
   const [picker, setPicker] = useState<{ afterId: string | null } | null>(null)
   const [help, setHelp] = useState(false)
   const [loopRounds, setLoopRounds] = useState(graph.loopRounds)
   const { nodes, edges } = history.present

   const draft = useMemo(() => toGraph(nodes, edges, loopRounds), [nodes, edges, loopRounds])
   const deferred = useDeferredValue(draft)
   const estimate = trpc.workflow.estimate.useQuery(
      {
         id: workflowId,
         graph: deferred,
      },
      { placeholderData: previous => previous }
   )
   const problems = estimate.data?.problems ?? []
   const nodesWith = (level: 'error' | 'note') =>
      new Set(problems.flatMap(problem => (problem.nodeId && problem.level === level ? [problem.nodeId] : [])))

   // The replay and the problems are drawn on top of the editable nodes.
   const shown = toFlow(draft, catalog, {
      steps: replay ?? undefined,
      invalid: nodesWith('error'),
      noted: nodesWith('note'),
      icpNames,
   })

   const commit = (update: (canvas: Canvas) => Canvas) => {
      setHistory(current => record(current, update(current.present)))
      setDirty(true)
   }
   const setPresent = (update: (canvas: Canvas) => Canvas) =>
      setHistory(current => ({
         ...current,
         present: update(current.present),
      }))

   const nodeOf = (id: string | null) => nodes.find(node => node.id === id) ?? null
   const selected = nodeOf(selectedId)

   const viewCentre = () => {
      const box = wrapper.current?.getBoundingClientRect()

      return box
         ? screenToFlowPosition({
              x: box.left + box.width / 2,
              y: box.top + box.height / 3,
           })
         : {
              x: 0,
              y: 0,
           }
   }

   const pick = (block: Block) => {
      const after = nodeOf(picker?.afterId ?? null)
      const id = newNodeId(block.type, nodes)
      const position = after
         ? placeBelow(
              after.position,
              nodes.map(node => node.position)
           )
         : viewCentre()

      commit(canvas => ({
         nodes: [
            ...canvas.nodes,
            {
               id,
               type: 'block',
               position,
               data: {
                  block,
                  config: startConfig(block.type),
                  step: null,
                  invalid: false,
                  noted: false,
                  faded: false,
               },
            },
         ],
         edges: after
            ? [
                 ...canvas.edges,
                 {
                    id: `${after.id}>${id}`,
                    source: after.id,
                    target: id,
                    sourceHandle: 'bottom',
                    targetHandle: 'top',
                 },
              ]
            : canvas.edges,
      }))
      setPicker(null)
      setSelectedId(id)
      setOpenId(block.fields.length > 0 ? id : null)
   }

   const setConfig = (patch: Record<string, ConfigValue>) =>
      commit(canvas => ({
         ...canvas,
         nodes: canvas.nodes.map(node =>
            node.id === openId ? { ...node, data: { ...node.data, config: { ...node.data.config, ...patch } } } : node
         ),
      }))

   const removeSelection = () => {
      if (selectedId) {
         commit(canvas => ({
            nodes: canvas.nodes.filter(({ id }) => id !== selectedId),
            edges: canvas.edges.filter(({ source, target }) => source !== selectedId && target !== selectedId),
         }))
         setSelectedId(null)
         setOpenId(null)
      } else if (edges.some(edge => edge.selected)) {
         commit(canvas => ({
            ...canvas,
            edges: canvas.edges.filter(edge => !edge.selected),
         }))
      }
   }

   const duplicate = () => {
      if (!selected) {
         return
      }

      const id = newNodeId(selected.data.block.type, nodes)

      commit(canvas => ({
         ...canvas,
         nodes: [
            ...canvas.nodes,
            {
               ...selected,
               id,
               selected: false,
               position: {
                  x: selected.position.x + DUPLICATE_OFFSET,
                  y: selected.position.y + DUPLICATE_OFFSET,
               },
            },
         ],
      }))
      setSelectedId(id)
   }

   const save = () => {
      if (dirty && !saving) {
         onSave(draft)
      }
   }

   const addBlock = () => setPicker({ afterId: selected?.data.block.output ? selected.id : null })

   const step = (change: (current: History<Canvas>) => History<Canvas>) => {
      setHistory(change)
      setDirty(true)
   }

   const onKey = useEffectEvent((event: KeyboardEvent) => {
      const { target } = event
      const inCanvas = target === document.body || (target instanceof Node && wrapper.current?.contains(target))
      const shortcut = inCanvas && !picker && !openId && !help ? shortcutOf(event) : null

      if (!shortcut) {
         return
      }

      event.preventDefault()

      if (shortcut.action === 'move') {
         const next = selectedId ? neighbourOf(nodes, edges, selectedId, shortcut.direction) : (nodes[0]?.id ?? null)

         setSelectedId(next ?? selectedId)

         return
      }

      const actions: Record<typeof shortcut.action, () => void> = {
         add: addBlock,
         open: () => setOpenId(selectedId),
         remove: removeSelection,
         close: () => setSelectedId(null),
         save,
         undo: () => step(undo),
         redo: () => step(redo),
         duplicate,
      }

      actions[shortcut.action]()
   })

   useEffect(() => {
      window.addEventListener('keydown', onKey)

      return () => window.removeEventListener('keydown', onKey)
   }, [])

   useEffect(() => {
      if (!dirty) {
         return undefined
      }

      const warn = (event: BeforeUnloadEvent) => event.preventDefault()

      window.addEventListener('beforeunload', warn)

      return () => window.removeEventListener('beforeunload', warn)
   }, [dirty])

   const openNode = nodeOf(openId)
   const actions = useMemo(() => ({ addAfter: (id: string) => setPicker({ afterId: id }) }), [])

   return (
      <CanvasActions value={actions}>
         <div
            ref={wrapper}
            tabIndex={-1}
            className="relative h-[calc(100svh-15rem)] min-h-[560px] overflow-hidden rounded-xl border outline-none"
         >
            <ReactFlow<FlowNode>
               nodes={shown.nodes.map(node => ({
                  ...node,
                  measured: nodeOf(node.id)?.measured,
                  selected: node.id === selectedId,
               }))}
               edges={shown.edges.map(edge => ({
                  ...edge,
                  selected: edges.find(({ id }) => id === edge.id)?.selected,
               }))}
               nodeTypes={NODE_TYPES}
               defaultEdgeOptions={EDGE_OPTIONS}
               deleteKeyCode={null}
               disableKeyboardA11y
               onNodesChange={(changes: NodeChange<FlowNode>[]) => {
                  setPresent(canvas => ({
                     ...canvas,
                     nodes: applyNodeChanges(changes, canvas.nodes),
                  }))

                  if (changes.some(({ type }) => type === 'position')) {
                     setDirty(true)
                  }
               }}
               onEdgesChange={(changes: EdgeChange[]) =>
                  setPresent(canvas => ({
                     ...canvas,
                     edges: applyEdgeChanges(changes, canvas.edges),
                  }))
               }
               onNodeDragStart={() => setHistory(current => record(current, current.present))}
               isValidConnection={({ source, target }) => canConnect(edges, source, target)}
               connectionMode={ConnectionMode.Loose}
               onConnect={connection =>
                  commit(canvas => ({
                     ...canvas,
                     edges: addEdge({ ...connection, id: `${connection.source}>${connection.target}` }, canvas.edges),
                  }))
               }
               onNodeClick={(_, node) => {
                  setSelectedId(node.id)
                  wrapper.current?.focus()
               }}
               onNodeDoubleClick={(_, node) => setOpenId(node.id)}
               onPaneClick={() => {
                  setSelectedId(null)
                  wrapper.current?.focus()
               }}
               fitView
            >
               <Background gap={20} />
               <Controls showInteractive={false} />
               <MiniMap pannable zoomable />
               <Panel
                  position="top-left"
                  className="bg-background/90 grid max-w-sm gap-2 rounded-lg border p-3 text-sm shadow-sm backdrop-blur"
               >
                  <p>
                     <span aria-hidden>💸 </span>
                     Up to <span className="font-medium">{formatUsd(estimate.data?.totalMicros ?? 0)}</span> a run
                     {estimate.data ? ` · ${estimate.data.posts} posts waiting` : ''}
                  </p>
                  {problems.length > 0 ? (
                     <ul className="grid gap-1">
                        {problems.map(problem => (
                           <li key={`${problem.nodeId ?? ''}${problem.message}`}>
                              <button
                                 type="button"
                                 disabled={!problem.nodeId}
                                 onClick={() => {
                                    setSelectedId(problem.nodeId ?? null)
                                    setOpenId(problem.nodeId ?? null)
                                 }}
                                 className={cn(
                                    'flex items-start gap-1.5 text-left text-xs enabled:hover:underline',
                                    problem.level === 'error' ? 'text-destructive' : 'text-warning'
                                 )}
                              >
                                 {problem.level === 'error' ? (
                                    <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                                 ) : (
                                    <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                                 )}
                                 {problem.message}
                              </button>
                           </li>
                        ))}
                     </ul>
                  ) : null}
                  {problems.every(({ level }) => level === 'note') ? (
                     <p className="text-muted-foreground text-xs">
                        <span aria-hidden>✅ </span>Ready to run
                     </p>
                  ) : null}
                  {hasLoop(edges) ? (
                     <label className="flex items-center gap-2 text-xs">
                        <span aria-hidden>🔁</span> Loop rounds
                        <Input
                           type="number"
                           min={1}
                           max={MAX_LOOP_ROUNDS}
                           className="h-7 w-16"
                           value={loopRounds ?? DEFAULT_LOOP_ROUNDS}
                           onChange={event => {
                              setLoopRounds(Math.min(MAX_LOOP_ROUNDS, Math.max(1, Number(event.target.value) || 1)))
                              setDirty(true)
                           }}
                        />
                     </label>
                  ) : null}
                  {saveError ? <p className="text-destructive text-xs">{saveError.message}</p> : null}
               </Panel>
               <Panel position="top-right" className="flex items-center gap-1">
                  <Button
                     variant="outline"
                     size="icon"
                     aria-label="Undo"
                     disabled={history.past.length === 0}
                     onClick={() => step(undo)}
                  >
                     <Undo2 />
                  </Button>
                  <Button
                     variant="outline"
                     size="icon"
                     aria-label="Redo"
                     disabled={history.future.length === 0}
                     onClick={() => step(redo)}
                  >
                     <Redo2 />
                  </Button>
                  <Button variant="outline" size="icon" aria-label="Keyboard shortcuts" onClick={() => setHelp(true)}>
                     <Keyboard />
                  </Button>
                  <Button variant="outline" onClick={addBlock}>
                     <Plus />
                     Add block
                  </Button>
                  <Button disabled={!dirty || saving} onClick={save}>
                     {saving ? <Loader2 className="animate-spin" /> : <Save />}
                     Save changes
                  </Button>
               </Panel>
               {nodes.length === 0 ? (
                  <Panel position="top-center" className="mt-40">
                     <Button size="lg" variant="outline" onClick={addBlock}>
                        <Plus />
                        Add the first block (Tab)
                     </Button>
                  </Panel>
               ) : null}
            </ReactFlow>
         </div>

         <BlockPicker
            open={picker !== null}
            catalog={catalog}
            after={nodeOf(picker?.afterId ?? null)?.data.block ?? null}
            onPick={pick}
            onClose={() => setPicker(null)}
         />
         <BlockSettings
            node={openNode}
            workflowId={workflowId}
            problems={problems.filter(({ nodeId }) => nodeId === openId)}
            output={
               replayRunId && openId
                  ? {
                       runId: replayRunId,
                       rounds: Math.max(
                          1,
                          ...(replay ?? []).filter(({ nodeId }) => nodeId === openId).map(({ round }) => round + 1)
                       ),
                    }
                  : null
            }
            icps={icps}
            parents={edges
               .filter(({ target }) => target === openId)
               .flatMap(({ source }) => {
                  const parent = nodeOf(source)

                  return parent
                     ? [
                          {
                             id: parent.id,
                             name: parent.data.block.label,
                          },
                       ]
                     : []
               })}
            workflows={workflows.filter(({ id }) => id !== workflowId)}
            onChange={setConfig}
            onRemove={removeSelection}
            onClose={() => {
               setOpenId(null)
               wrapper.current?.focus()
            }}
         />
         <Dialog open={help} onOpenChange={setHelp}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>Keyboard shortcuts</DialogTitle>
                  <DialogDescription>They work when the canvas has focus.</DialogDescription>
               </DialogHeader>
               <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                  {SHORTCUT_HELP.map(([keys, what]) => (
                     <div key={keys} className="contents">
                        <dt>
                           <kbd className="bg-muted rounded border px-1.5 py-0.5 font-mono text-xs">{keys}</kbd>
                        </dt>
                        <dd className="text-muted-foreground">{what}</dd>
                     </div>
                  ))}
               </dl>
            </DialogContent>
         </Dialog>
      </CanvasActions>
   )
}

// The workflow as a graph of blocks (React Flow). It edits a draft; nothing is saved until Save changes.
export const WorkflowCanvas = (props: Props) => (
   <ReactFlowProvider>
      <Editor {...props} />
   </ReactFlowProvider>
)
