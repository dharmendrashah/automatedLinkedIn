import { type Graph } from '@automatedLinkedIn/contracts'

// The saved versions of a workflow's graph (.plan/workflow-engine-p5-editor.md).

// How many versions a workflow keeps; the oldest are dropped.
export const MAX_VERSIONS = 50

// Whether two graphs are the same, whatever order the database gave the keys of an object.
export const sameGraph = (a: Graph, b: Graph) => stable(a) === stable(b)

const stable = (value: unknown): string =>
   JSON.stringify(value, (_key, inner: unknown) =>
      inner && typeof inner === 'object' && !Array.isArray(inner)
         ? Object.fromEntries(Object.entries(inner).sort(([left], [right]) => left.localeCompare(right)))
         : inner
   )

// The files of the graphs that go that no graph that stays refers to, each once: only those may be deleted.
export const unheldFiles = (leaving: string[], staying: string[]) => {
   const held = new Set(staying)

   return [...new Set(leaving)].filter(key => !held.has(key))
}
