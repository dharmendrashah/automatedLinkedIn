import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { type ReactNode, useState } from 'react'

import { type Block, type ConfigValue, type Graph } from './types'

import { ApiTriggerInput } from './api-request'
import { BlockOutput } from './block-output'
import { type BlockRun } from './block-run'
import { PlannedInput, RunStrip, StepErrorPanel } from './block-run-panel'

export type RunInfo = {
   // The run the block's state is read from; null when the workflow has no run yet.
   runId: string | null
   blockRun: BlockRun
   labelOf: (nodeId: string) => string
   // What the estimate says the block takes, or null while it is not known.
   estimate: { items: number; costMicros: number } | null
   // The workflow as drawn, and whether it is switched on, for the "When called by API" block's sample call.
   api: { enabled: boolean; graph: Graph; catalog: readonly Block[] }
}

type Props = {
   nodeId: string
   workflowId: string
   block: Block
   values: Record<string, ConfigValue | undefined>
   parents: { id: string; name: string }[]
   run: RunInfo
   // The block's settings in one line, and what it takes in words.
   summary: string
   takes: string
   fileName?: string
   settings: ReactNode
}

// Whether a line leads straight from the "When called by API" block into this one.
const afterCall = (graph: Graph, nodeId: string) =>
   graph.edges.some(
      ({ from, to }) => to === nodeId && graph.nodes.some(({ id, type }) => id === from && type === 'trigger.api')
   )

const EXPIRED = 'These results were deleted 14 days after the run ended.'

const outputText = (blockRun: BlockRun) =>
   blockRun.expired
      ? EXPIRED
      : blockRun.state === 'skipped'
        ? 'This block did not run, so it passed nothing on.'
        : blockRun.state === 'failed'
          ? 'This block failed, so it passed nothing on.'
          : blockRun.state === 'working' || blockRun.state === 'waiting'
            ? 'Nothing passed on yet.'
            : 'Nothing passed through this block in this run.'

// A block's state in the last run, its error, and the Input, Output and Settings tabs. It opens on the input for a block that
// has not run and on the output for one that has.
export const BlockRunTabs = ({
   nodeId,
   workflowId,
   block,
   values,
   parents,
   run,
   summary,
   takes,
   fileName,
   settings,
}: Props) => {
   const { blockRun, runId } = run
   const [tab, setTab] = useState<string>(blockRun.defaultTab)
   const ran = runId !== null && blockRun.step !== null && blockRun.state !== 'never'
   const { step } = blockRun
   const failed = step !== null && (blockRun.state === 'failed' || (blockRun.state === 'gaps' && step.errorCode))

   return (
      <div className="grid gap-4">
         <RunStrip blockRun={blockRun} />
         {step && failed ? <StepErrorPanel step={step} onShowSettings={() => setTab('settings')} /> : null}
         <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
               <TabsTrigger value="input">Input</TabsTrigger>
               <TabsTrigger value="output">Output</TabsTrigger>
               <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
            <TabsContent value="input">
               {block.type === 'trigger.api' ? (
                  <ApiTriggerInput
                     workflowId={workflowId}
                     enabled={run.api.enabled}
                     graph={run.api.graph}
                     catalog={run.api.catalog}
                  />
               ) : ran ? (
                  <BlockOutput
                     kind="input"
                     runId={runId}
                     nodeId={nodeId}
                     rounds={blockRun.rounds}
                     labelOf={run.labelOf}
                     fileName={fileName ? `${fileName}-input` : undefined}
                     emptyText={blockRun.expired ? EXPIRED : 'Nothing reached this block in this run.'}
                  />
               ) : (
                  <PlannedInput
                     block={block}
                     workflowId={workflowId}
                     values={values}
                     parents={parents}
                     estimate={run.estimate}
                     summary={summary}
                     takes={takes}
                     afterCall={afterCall(run.api.graph, nodeId)}
                  />
               )}
            </TabsContent>
            <TabsContent value="output">
               {ran ? (
                  <BlockOutput
                     runId={runId}
                     nodeId={nodeId}
                     rounds={blockRun.rounds}
                     fileName={fileName}
                     emptyText={outputText(blockRun)}
                  />
               ) : (
                  <p className="text-muted-foreground text-sm">
                     Nothing yet. Run the workflow to see what this block passes on.
                  </p>
               )}
            </TabsContent>
            <TabsContent value="settings">{settings}</TabsContent>
         </Tabs>
      </div>
   )
}
