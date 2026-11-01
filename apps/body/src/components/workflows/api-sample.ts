import { type Block, type Graph } from './types'

// What a call to the "When called by API" block can carry, from the blocks that come after it
// (.plan/api-trigger-input.md, .plan/api-fed-blocks-and-samples.md). Shared by the block's Input tab and the workflow's
// API tab. It reads the descriptions the blocks carry in the catalog, so a new block that can be fed is not added here.

export type ApiInput = Block['api'][number]

// Ends a line of a shell command that goes on below.
const BACKSLASH = String.fromCharCode(92)

// The fields of the blocks the API trigger reaches along its lines, each field once, in the order of the catalog.
export const apiInputsOf = (graph: Pick<Graph, 'nodes' | 'edges'>, catalog: readonly Block[]): ApiInput[] => {
   const seen = new Set<string>()
   const queue = graph.nodes.filter(({ type }) => type === 'trigger.api').map(({ id }) => id)

   for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      if (!seen.has(id)) {
         seen.add(id)
         queue.push(...graph.edges.filter(({ from }) => from === id).map(({ to }) => to))
      }
   }

   const reached = new Set(graph.nodes.filter(({ id }) => seen.has(id)).map(({ type }) => type))

   const fields = new Map<string, ApiInput>()

   for (const block of catalog.filter(({ type }) => reached.has(type))) {
      for (const input of block.api) {
         if (!fields.has(input.field)) {
            fields.set(input.field, input)
         }
      }
   }

   return [...fields.values()]
}

// A JSON body with example values for each field, or null when a call carries nothing.
export const sampleBody = (inputs: readonly ApiInput[]) =>
   inputs.length > 0
      ? JSON.stringify(
           Object.fromEntries(
              inputs.map(({ field, shape, example }) => [field, shape === 'text' ? example[0] : example])
           ),
           null,
           2
        )
      : null

// The call as a shell command; `YOUR_API_KEY` stands in until a key was just made.
export const curlOf = (address: string, key: string | null, body: string | null) =>
   [
      `curl -X POST '${address}'`,
      `  -H 'Authorization: Bearer ${key ?? 'YOUR_API_KEY'}'`,
      ...(body ? [`  -H 'Content-Type: application/json'`, `  -d '${body.replace(/\n\s*/g, ' ')}'`] : []),
   ].join(` ${BACKSLASH}\n`)

// A made-up item of each kind a block can take in, for the Input tab of a block that has not run. One place, so a new
// block needs nothing: it takes a kind, and the kind has its sample.
const SAMPLE_BY_KIND = {
   post: {
      author: 'Ada Lovelace',
      text: 'Why engines should do the boring work.',
      link: 'https://www.linkedin.com/posts/ada-lovelace_engines-activity-7452924970042826753-AbCd',
   },
   profile: {
      name: 'Ada Lovelace',
      headline: 'Founder at Analytical Engines',
      link: 'https://www.linkedin.com/in/ada-lovelace',
   },
   company: {
      name: 'Stripe',
      website: 'stripe.com',
      link: 'https://www.linkedin.com/company/stripe',
   },
} as const

// A sample of one item the block takes in, as JSON; null for a block that takes none (it starts a chain).
export const sampleOf = (block: Pick<Block, 'input'>) =>
   block.input !== null && block.input !== 'start' ? JSON.stringify(SAMPLE_BY_KIND[block.input], null, 2) : null

// What a block with items of a kind in front of it is called, in plain words.
export const KIND_WORDS = {
   post: 'posts',
   profile: 'people',
   company: 'companies',
} as const
