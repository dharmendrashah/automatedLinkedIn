import { describe, expect, it } from 'vitest'

import { networkEntry } from './networkLog'

describe('networkEntry', () => {
   it('should keep the method, host, path and status of a request the page made for data', () => {
      expect(
         networkEntry(
            'POST',
            'https://www.linkedin.com/voyager/api/contentcreation/normShares?action=create&x=1',
            201,
            'fetch'
         )
      ).toEqual({
         method: 'POST',
         host: 'www.linkedin.com',
         path: '/voyager/api/contentcreation/normShares',
         status: 201,
         type: 'fetch',
      })
      expect(networkEntry('GET', 'https://www.linkedin.com/feed/', 200, 'document')?.path).toBe('/feed/')
   })

   it('should drop the query, so no value of it is ever kept', () => {
      const entry = networkEntry('GET', 'https://www.linkedin.com/a?token=secret&id=7', 200, 'xhr')

      expect(JSON.stringify(entry)).not.toContain('secret')
   })

   it('should leave out pictures, styles, scripts, fonts and anything that is not an address', () => {
      expect(networkEntry('GET', 'https://static.licdn.com/a.js', 200, 'script')).toBeUndefined()
      expect(networkEntry('GET', 'https://media.licdn.com/a.jpg', 200, 'image')).toBeUndefined()
      expect(networkEntry('GET', 'data:text/plain,hello', 200, 'fetch')).toBeUndefined()
      expect(networkEntry('GET', 'not a url', 200, 'fetch')).toBeUndefined()
   })

   it('should cut a very long path', () => {
      expect(networkEntry('GET', `https://a.com/${'x'.repeat(500)}`, 200, 'xhr')?.path).toHaveLength(300)
   })
})
