import { describe, expect, it } from 'vitest'

import { unique } from './registry'

describe('unique', () => {
   it('should hand back the definitions when every name is valid and different', () => {
      const items = [{ name: 'task-results' }, { name: 'proxy-scoring' }]

      expect(unique('consumer', items)).toBe(items)
   })

   it('should refuse the same name twice', () => {
      expect(() => unique('job', [{ name: 'a' }, { name: 'a' }])).toThrow('The job "a" is registered twice')
   })

   it.each(['', 'Task', 'has space', '../x', '1st'])('should refuse the name %j', name => {
      expect(() => unique('consumer', [{ name }])).toThrow('is not valid')
   })
})
