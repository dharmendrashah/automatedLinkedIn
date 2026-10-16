import { describe, expect, it } from 'vitest'

import { createWorkerConfig, parseRoles } from './config'

describe('parseRoles', () => {
   it('should read a comma separated list, ignoring spaces and repeats', () => {
      expect([...parseRoles(' consumers , jobs,jobs ')]).toEqual(['consumers', 'jobs'])
   })

   it('should accept one role', () => {
      expect([...parseRoles('consumers')]).toEqual(['consumers'])
   })

   it('should refuse an unknown role', () => {
      expect(() => parseRoles('consumers,cron')).toThrow('unknown role "cron"')
   })

   it.each(['', ' , '])('should refuse an empty list %j', value => {
      expect(() => parseRoles(value)).toThrow('empty')
   })
})

describe('createWorkerConfig', () => {
   it('should keep the numbers and parse the roles', () => {
      const config = createWorkerConfig({
         roles: 'jobs',
         healthPort: 3004,
         shutdownGraceMs: 1000,
      })

      expect(config).toEqual({
         roles: new Set(['jobs']),
         healthPort: 3004,
         shutdownGraceMs: 1000,
      })
   })
})
