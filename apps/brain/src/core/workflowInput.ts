import { type Graph, backEdges, edgeKey, portKey, portOfEdge } from '@automatedLinkedIn/contracts'

// Where the items that reach a block are kept: the output of the blocks before it. The engine reads them to run a step
// and the Input tab of a block reads the same places, so the two cannot drift (.plan/workflow-hardening-and-block-details.md).

export type ItemSource = { nodeId: string; round: number }

// Where an If or a "Run another workflow" block keeps what it did not pass on, for an Else after it.
export const ELSE_SUFFIX = '~else'

// A For each always reads what reached it in the first round; it hands out one batch per round.
export const sourceRound = (type: string, round: number) => (type === 'logic.forEach' ? 0 : round)

// The outputs the lines into a block leave from, in the same round, left out when the block before has no step in the
// run (not run, or not in it). An output other than main is kept under `<id>~<output>`.
export const forwardSources = (
   graph: Graph,
   node: { id: string; type: string },
   round: number,
   has: (nodeId: string, round: number) => boolean
): ItemSource[] => {
   const back = backEdges(graph)
   const at = sourceRound(node.type, round)

   return graph.edges
      .filter(edge => edge.to === node.id && !back.has(edgeKey(edge)) && has(edge.from, at))
      .map(edge => ({
         nodeId: portKey(edge.from, portOfEdge(graph, edge)),
         round: at,
      }))
}

// The blocks a loop's way back brings items from.
export const backSources = (graph: Graph, nodeId: string): string[] => {
   const back = backEdges(graph)

   return graph.edges.filter(edge => edge.to === nodeId && back.has(edgeKey(edge))).map(({ from }) => from)
}

// What a block took in, as the owner sees it: the outputs of the blocks before it (an Else reads the else output of the
// block before it), and in a later round of a loop also what the round before found (all of it here, the engine keeps
// only what was new).
export const inputKeys = (
   graph: Graph,
   node: { id: string; type: string },
   round: number,
   has: (nodeId: string, round: number) => boolean
): ItemSource[] => {
   const forward = forwardSources(graph, node, round, has)
   const loop =
      round > 0
         ? backSources(graph, node.id).map(from => ({
              nodeId: from,
              round: round - 1,
           }))
         : []

   return [...forward, ...loop]
}
