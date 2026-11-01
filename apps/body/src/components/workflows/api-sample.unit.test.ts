import { describe, expect, it } from 'vitest'

import { type Block, type Graph } from './types'

import { apiInputsOf, curlOf, sampleBody, sampleOf } from './api-sample'

const described = (type: Block['type'], api: Block['api'], input: Block['input'] = 'start'): Block => ({
   type,
   group: 'Inputs',
   label: type,
   summary: '',
   costHint: null,
   presets: [],
   api,
   version: 1,
   deprecated: false,
   unit: null,
   flow: null,
   flags: {},
   input,
   output: 'profile',
   fields: [],
   defaults: {},
})

const links = (field: string, what: string, example: string): Block['api'] => [
   {
      field,
      shape: 'list',
      check: 'link',
      what,
      example: [example],
   },
]

// The order of the catalog is the order of the fields in a body.
const catalog = [
   described(
      'input.profiles',
      links('profiles', 'LinkedIn links of people', 'https://www.linkedin.com/in/ada-lovelace')
   ),
   described('input.posts', links('posts', 'LinkedIn links of posts', 'https://www.linkedin.com/posts/ada')),
   described(
      'input.companies',
      links('companies', 'LinkedIn links of companies', 'https://www.linkedin.com/company/stripe')
   ),
   described('collect.findPosts', [
      {
         field: 'keywords',
         shape: 'text',
         check: 'text',
         what: 'words to search for',
         example: ['outbound sales'],
         setting: 'keywords',
      },
   ]),
   described('collect.searchPeople', [
      {
         field: 'keywords',
         shape: 'text',
         check: 'text',
         what: 'words to search for',
         example: ['outbound sales'],
         setting: 'keywords',
      },
      {
         field: 'titles',
         shape: 'list',
         check: 'text',
         what: 'current job titles',
         example: ['Head of Sales'],
         setting: 'titles',
      },
   ]),
   described('account.select', []),
   described('collect.commenters', [], 'post'),
]

const node = (id: string, type: string) => ({
   id,
   type: type as Graph['nodes'][number]['type'],
   config: {},
   position: {
      x: 0,
      y: 0,
   },
})

const line = (from: string, to: string) => ({
   from,
   to,
})

const fields = (graph: Graph) => apiInputsOf(graph, catalog).map(({ field }) => field)

describe('apiInputsOf', () => {
   it('should take the input blocks the API trigger reaches along its lines, through the blocks in between', () => {
      const graph: Graph = {
         nodes: [
            node('api', 'trigger.api'),
            node('pool', 'account.select'),
            node('people', 'input.profiles'),
            node('posts', 'input.posts'),
         ],
         edges: [line('api', 'pool'), line('pool', 'people')],
      }

      expect(fields(graph)).toEqual(['profiles'])
   })

   it('should leave out input blocks the trigger does not reach, and list each field once', () => {
      const graph: Graph = {
         nodes: [
            node('api', 'trigger.api'),
            node('a', 'input.companies'),
            node('b', 'input.companies'),
            node('lonely', 'input.posts'),
         ],
         edges: [line('api', 'a'), line('api', 'b')],
      }

      expect(fields(graph)).toEqual(['companies'])
   })

   it('should give none when the trigger reaches no input block, or the workflow has no API trigger', () => {
      expect(
         fields({
            nodes: [node('api', 'trigger.api'), node('csv', 'output.csv')],
            edges: [line('api', 'csv')],
         })
      ).toEqual([])
      expect(
         fields({
            nodes: [node('start', 'trigger.manual'), node('people', 'input.profiles')],
            edges: [line('start', 'people')],
         })
      ).toEqual([])
   })

   it('should end on a loop that leads back to the trigger', () => {
      const graph: Graph = {
         nodes: [node('api', 'trigger.api'), node('people', 'input.profiles')],
         edges: [line('api', 'people'), line('people', 'api')],
      }

      expect(fields(graph)).toEqual(['profiles'])
   })

   it('should keep the order of the fields stable', () => {
      const graph: Graph = {
         nodes: [
            node('api', 'trigger.api'),
            node('c', 'input.companies'),
            node('p', 'input.posts'),
            node('u', 'input.profiles'),
         ],
         edges: [line('api', 'c'), line('api', 'p'), line('api', 'u')],
      }

      expect(fields(graph)).toEqual(['profiles', 'posts', 'companies'])
   })

   it('should take the fields of a collect block that starts a chain, a field shared by two blocks once', () => {
      const graph: Graph = {
         nodes: [node('api', 'trigger.api'), node('posts', 'collect.findPosts'), node('who', 'collect.searchPeople')],
         edges: [line('api', 'posts'), line('api', 'who')],
      }

      expect(fields(graph)).toEqual(['keywords', 'titles'])
   })

   it('should give no field for a block that describes none, even right after the trigger', () => {
      const graph: Graph = {
         nodes: [node('api', 'trigger.api'), node('c', 'collect.commenters')],
         edges: [line('api', 'c')],
      }

      expect(fields(graph)).toEqual([])
   })
})

describe('sampleBody and curlOf', () => {
   const inputs = apiInputsOf(
      {
         nodes: [node('api', 'trigger.api'), node('u', 'input.profiles')],
         edges: [line('api', 'u')],
      },
      catalog
   )

   it('should make a body with one example link for each field, and none with no fields', () => {
      expect(JSON.parse(sampleBody(inputs) ?? '{}')).toEqual({
         profiles: ['https://www.linkedin.com/in/ada-lovelace'],
      })
      expect(sampleBody([])).toBeNull()
   })

   it('should send a text field as a string and a list field as a list', () => {
      const graph: Graph = {
         nodes: [node('api', 'trigger.api'), node('who', 'collect.searchPeople')],
         edges: [line('api', 'who')],
      }

      expect(JSON.parse(sampleBody(apiInputsOf(graph, catalog)) ?? '{}')).toEqual({
         keywords: 'outbound sales',
         titles: ['Head of Sales'],
      })
   })

   it('should write a cURL with the header and the body, using a placeholder until there is a key', () => {
      const curl = curlOf('https://api.test/api/workflows/w1/run', null, sampleBody(inputs))

      expect(curl).toContain("curl -X POST 'https://api.test/api/workflows/w1/run'")
      expect(curl).toContain("-H 'Authorization: Bearer YOUR_API_KEY'")
      expect(curl).toContain("-H 'Content-Type: application/json'")
      expect(curl).toContain('-d \'{ "profiles": [ "https://www.linkedin.com/in/ada-lovelace" ] }\'')
      expect(curlOf('https://api.test/x', 'abc123', null)).toBe(
         "curl -X POST 'https://api.test/x' \\\n  -H 'Authorization: Bearer abc123'"
      )
   })
})

describe('sampleOf', () => {
   it('should give a sample item of the kind a block takes, and none for a block that starts a chain', () => {
      expect(JSON.parse(sampleOf(described('collect.commenters', [], 'post')) ?? '{}')).toHaveProperty('author')
      expect(JSON.parse(sampleOf(described('score.icp', [], 'profile')) ?? '{}')).toHaveProperty('headline')
      expect(JSON.parse(sampleOf(described('collect.employees', [], 'company')) ?? '{}')).toHaveProperty('website')
      expect(sampleOf(described('input.posts', []))).toBeNull()
   })
})
