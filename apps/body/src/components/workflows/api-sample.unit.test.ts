import { describe, expect, it } from 'vitest'

import { type Graph } from './types'

import { apiInputsOf, curlOf, sampleBody } from './api-sample'

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

const fields = (graph: Graph) => apiInputsOf(graph).map(({ field }) => field)

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
})

describe('sampleBody and curlOf', () => {
   const inputs = apiInputsOf({
      nodes: [node('api', 'trigger.api'), node('u', 'input.profiles')],
      edges: [line('api', 'u')],
   })

   it('should make a body with one example link for each field, and none with no fields', () => {
      expect(JSON.parse(sampleBody(inputs) ?? '{}')).toEqual({
         profiles: ['https://www.linkedin.com/in/ada-lovelace'],
      })
      expect(sampleBody([])).toBeNull()
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
