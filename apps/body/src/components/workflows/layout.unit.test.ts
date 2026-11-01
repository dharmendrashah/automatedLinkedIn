import { describe, expect, it } from 'vitest'

import { type Graph } from './types'

import { isLeftToRight, layoutTopToBottom, neighbourOf, placeBeside } from './layout'

const node = (id: string, x: number, y: number) => ({
   id,
   type: 'process.dedupe' as const,
   config: {},
   position: {
      x,
      y,
   },
})

// The old flagship shape: a start, two side-by-side branches, then one block.
const sideways: Graph = {
   nodes: [node('posts', 0, 0), node('commenters', 240, 0), node('reactors', 240, 160), node('dedupe', 480, 0)],
   edges: [
      {
         from: 'posts',
         to: 'commenters',
      },
      {
         from: 'posts',
         to: 'reactors',
      },
      {
         from: 'commenters',
         to: 'dedupe',
      },
      {
         from: 'reactors',
         to: 'dedupe',
      },
   ],
}

const yOf = (graph: Graph, id: string) => graph.nodes.find(item => item.id === id)?.position.y ?? Number.NaN
const xOf = (graph: Graph, id: string) => graph.nodes.find(item => item.id === id)?.position.x ?? Number.NaN

describe('layout', () => {
   it('should tell a left-to-right graph from a top-to-bottom one', () => {
      expect(isLeftToRight(sideways)).toBe(true)
      expect(isLeftToRight(layoutTopToBottom(sideways))).toBe(false)
      expect(isLeftToRight({ nodes: [node('a', 0, 0)], edges: [] })).toBe(false)
   })

   it('should leave a graph alone once its lines have sides, however its blocks are placed', () => {
      const placed: Graph = {
         ...sideways,
         edges: sideways.edges.map(edge => ({
            ...edge,
            fromSide: 'right' as const,
            toSide: 'left' as const,
         })),
      }

      expect(isLeftToRight(placed)).toBe(false)
   })

   it('should lay steps top to bottom with branches side by side, keeping every block and line', () => {
      const laid = layoutTopToBottom(sideways)

      expect(laid.nodes.map(({ id }) => id)).toEqual(sideways.nodes.map(({ id }) => id))
      expect(laid.edges).toEqual(sideways.edges)
      expect(laid.edges.every(({ from, to }) => yOf(laid, to) > yOf(laid, from))).toBe(true)
      expect(yOf(laid, 'commenters')).toBe(yOf(laid, 'reactors'))
      expect(xOf(laid, 'commenters')).not.toBe(xOf(laid, 'reactors'))
   })

   it('should place a new block on the chosen side of its parent, moved along when the spot is taken', () => {
      const origin = {
         x: 0,
         y: 0,
      }

      expect(placeBeside(origin, 'bottom', [])).toEqual({ x: 0, y: 140 })
      expect(placeBeside(origin, 'top', [])).toEqual({ x: 0, y: -140 })
      expect(placeBeside(origin, 'right', [])).toEqual({ x: 280, y: 0 })
      expect(placeBeside(origin, 'left', [])).toEqual({ x: -280, y: 0 })
      expect(placeBeside(origin, 'bottom', [{ x: 0, y: 140 }])).toEqual({ x: 280, y: 140 })
      expect(placeBeside(origin, 'top', [{ x: 0, y: -140 }])).toEqual({ x: 280, y: -140 })
      expect(placeBeside(origin, 'right', [{ x: 280, y: 0 }])).toEqual({ x: 280, y: 140 })
      expect(
         placeBeside(origin, 'left', [
            { x: -280, y: 0 },
            { x: -280, y: 140 },
         ])
      ).toEqual({ x: -280, y: 280 })
   })

   it('should move the selection along the lines and across the row', () => {
      const nodes = sideways.nodes.map(({ id, position }) => ({
         id,
         position,
      }))
      const edges = sideways.edges.map(({ from, to }) => ({
         source: from,
         target: to,
      }))

      expect(neighbourOf(nodes, edges, 'commenters', 'down')).toBe('dedupe')
      expect(neighbourOf(nodes, edges, 'dedupe', 'up')).toBe('commenters')
      expect(neighbourOf(nodes, edges, 'posts', 'right')).toBe('commenters')
      expect(neighbourOf(nodes, edges, 'posts', 'up')).toBeNull()
   })
})
