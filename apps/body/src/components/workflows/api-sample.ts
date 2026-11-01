import { type Graph } from './types'

// What a call to the "When called by API" block can carry, from the blocks that come after it
// (.plan/api-trigger-input.md). Shared by the block's Input tab and the workflow's API tab.

// What each input block can take from a call, with an example link. The order is the order of the fields in a body.
export const API_INPUTS = [
   {
      type: 'input.profiles',
      field: 'profiles',
      what: 'people',
      example: 'https://www.linkedin.com/in/ada-lovelace',
   },
   {
      type: 'input.posts',
      field: 'posts',
      what: 'posts',
      example: 'https://www.linkedin.com/posts/ada-lovelace_engines-activity-7452924970042826753-AbCd',
   },
   {
      type: 'input.companies',
      field: 'companies',
      what: 'companies',
      example: 'https://www.linkedin.com/company/stripe',
   },
] as const

export type ApiInput = (typeof API_INPUTS)[number]

// Ends a line of a shell command that goes on below.
const BACKSLASH = String.fromCharCode(92)

// The input blocks the API trigger reaches along its lines, each field once.
export const apiInputsOf = (graph: Pick<Graph, 'nodes' | 'edges'>): ApiInput[] => {
   const seen = new Set<string>()
   const queue = graph.nodes.filter(({ type }) => type === 'trigger.api').map(({ id }) => id)

   for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      if (!seen.has(id)) {
         seen.add(id)
         queue.push(...graph.edges.filter(({ from }) => from === id).map(({ to }) => to))
      }
   }

   const reached = new Set(graph.nodes.filter(({ id }) => seen.has(id)).map(({ type }) => type))

   return API_INPUTS.filter(({ type }) => reached.has(type))
}

// A JSON body with one example link for each field, or null when a call carries nothing.
export const sampleBody = (inputs: readonly ApiInput[]) =>
   inputs.length > 0
      ? JSON.stringify(Object.fromEntries(inputs.map(({ field, example }) => [field, [example]])), null, 2)
      : null

// The call as a shell command; `YOUR_API_KEY` stands in until a key was just made.
export const curlOf = (address: string, key: string | null, body: string | null) =>
   [
      `curl -X POST '${address}'`,
      `  -H 'Authorization: Bearer ${key ?? 'YOUR_API_KEY'}'`,
      ...(body ? [`  -H 'Content-Type: application/json'`, `  -d '${body.replace(/\n\s*/g, ' ')}'`] : []),
   ].join(` ${BACKSLASH}\n`)
