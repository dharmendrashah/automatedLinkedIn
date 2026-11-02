import { describe, expect, it } from 'vitest'

import { readCompanyFilters } from './companyFilters'
import { readPeopleFilters } from './peopleFilters'
import { type Graph, type NodeConfig, errorsOf, validateGraph } from './workflow'

const graphWith = (config: NodeConfig): Graph => ({
   nodes: [
      {
         id: 'a',
         type: 'input.companies',
         position: {
            x: 0,
            y: 0,
         },
         config,
      },
   ],
   edges: [],
})

const errors = (config: NodeConfig) => errorsOf(validateGraph(graphWith(config))).map(({ message }) => message)

describe('the filters of a Profiles input block', () => {
   const profiles = (config: NodeConfig): string[] =>
      errorsOf(
         validateGraph({
            nodes: [
               {
                  id: 'a',
                  type: 'input.profiles',
                  position: {
                     x: 0,
                     y: 0,
                  },
                  config,
               },
            ],
            edges: [],
         })
      ).map(({ message }) => message)

   it('should read the page filters, dates as instants, and refuse what the page would refuse', () => {
      expect(readPeopleFilters('{"countries":["India"]}').filters?.countries).toEqual(['India'])
      expect(readPeopleFilters('{"firstSeen":{"from":"2026-10-01T00:00:00.000Z"}}').filters?.firstSeen?.from).toEqual(
         new Date('2026-10-01T00:00:00.000Z')
      )
      expect(readPeopleFilters('{"connectedTo":"a1"}').error).toBe('the filters are not valid.')
   })

   it('should flag bad filters only for My network, and other dates only for My network', () => {
      expect(
         profiles({
            source: 'network',
            filters: '{"ghost":1}',
         })
      ).toContain('Profiles: the filters are not valid.')
      expect(
         profiles({
            source: 'profiles',
            filters: '{"ghost":1}',
         })
      ).not.toContain('Profiles: the filters are not valid.')
      expect(
         profiles({
            source: 'profiles',
            dateField: 'connected',
         }).join(' ')
      ).toContain('use My network')
      expect(
         profiles({
            source: 'network',
            dateField: 'connected',
         }).join(' ')
      ).not.toContain('use My network')
   })
})

describe('the filters of a Companies input block', () => {
   it('should read none from empty text and the filters from valid text', () => {
      expect(readCompanyFilters('')).toEqual({
         filters: null,
         error: null,
      })
      expect(readCompanyFilters('{"sizes":["11-50"],"countries":["India"]}').filters).toEqual({
         sizes: ['11-50'],
         countries: ['India'],
      })
   })

   it('should refuse text that is not JSON, a filter that does not exist, and a value out of range', () => {
      for (const text of [
         'sizes',
         '{"ghost":1}',
         '{"read":"yesterday"}',
         '{"team":[{"kind":"skill","values":[],"min":1}]}',
      ]) {
         expect(readCompanyFilters(text)).toEqual({
            filters: null,
            error: 'the filters are not valid.',
         })
      }
   })

   it('should flag a block whose filters are not valid and accept one whose filters are', () => {
      expect(errors({ filters: '{"ghost":1}' })).toEqual(['Companies: the filters are not valid.'])
      expect(errors({ filters: '{"hasJobs":true}' }).filter(message => message.includes('filters'))).toEqual([])
   })
})
