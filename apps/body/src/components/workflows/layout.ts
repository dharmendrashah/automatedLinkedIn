import { Graph as Dagre, layout } from '@dagrejs/dagre'

import { type Graph } from './types'

// Room a block takes on the canvas, for laying graphs out.
export const NODE_WIDTH = 240
export const NODE_HEIGHT = 96
const STEP_Y = 140
const BRANCH_X = 280

type Point = { x: number; y: number }

const positionOf = (graph: Graph, id: string) => graph.nodes.find(node => node.id === id)?.position

// Saved before the canvas ran top to bottom: most lines go to the right rather than down.
export const isLeftToRight = (graph: Graph) => {
   const sideways = graph.edges.filter(({ from, to }) => {
      const a = positionOf(graph, from)
      const b = positionOf(graph, to)

      return a && b && b.x - a.x > Math.abs(b.y - a.y)
   })

   return sideways.length * 2 > graph.edges.length
}

// Steps top to bottom, side-by-side blocks next to each other. Only positions change.
export const layoutTopToBottom = (graph: Graph): Graph => {
   const dagre = new Dagre()

   dagre.setGraph({
      rankdir: 'TB',
      nodesep: BRANCH_X - NODE_WIDTH,
      ranksep: STEP_Y - NODE_HEIGHT,
   })
   dagre.setDefaultEdgeLabel(() => ({}))
   graph.nodes.forEach(({ id }) =>
      dagre.setNode(id, {
         width: NODE_WIDTH,
         height: NODE_HEIGHT,
      })
   )
   graph.edges.forEach(({ from, to }) => dagre.setEdge(from, to))
   layout(dagre)

   return {
      ...graph,
      nodes: graph.nodes.map(node => {
         const { x, y } = dagre.node(node.id)

         return {
            ...node,
            position: {
               x: Math.round(x - NODE_WIDTH / 2),
               y: Math.round(y - NODE_HEIGHT / 2),
            },
         }
      }),
   }
}

// Below `parent`, moved right until no block is in the way.
export const placeBelow = (parent: Point, taken: Point[]): Point => {
   const free = (point: Point) =>
      !taken.some(other => Math.abs(other.x - point.x) < NODE_WIDTH && Math.abs(other.y - point.y) < NODE_HEIGHT)
   let point = {
      x: parent.x,
      y: parent.y + STEP_Y,
   }

   while (!free(point)) {
      point = {
         ...point,
         x: point.x + BRANCH_X,
      }
   }

   return point
}

export type Direction = 'up' | 'down' | 'left' | 'right'

// The block an arrow key moves the selection to: up and down follow the lines, left and right the nearest block on
// about the same row.
export const neighbourOf = (
   nodes: { id: string; position: Point }[],
   edges: { source: string; target: string }[],
   id: string,
   direction: Direction
) => {
   const here = nodes.find(node => node.id === id)?.position

   if (!here) {
      return null
   }

   if (direction === 'up' || direction === 'down') {
      const linked =
         direction === 'up'
            ? edges.filter(({ target }) => target === id).map(({ source }) => source)
            : edges.filter(({ source }) => source === id).map(({ target }) => target)
      const [nearest] = nodes
         .filter(node => linked.includes(node.id))
         .sort((a, b) => Math.abs(a.position.x - here.x) - Math.abs(b.position.x - here.x))

      return nearest?.id ?? null
   }

   const sign = direction === 'right' ? 1 : -1
   const [nearest] = nodes
      .filter(node => (node.position.x - here.x) * sign > 0 && Math.abs(node.position.y - here.y) < NODE_HEIGHT)
      .sort((a, b) => Math.abs(a.position.x - here.x) - Math.abs(b.position.x - here.x))

   return nearest?.id ?? null
}
