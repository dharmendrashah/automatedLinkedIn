import { describe, expect, it, vi } from 'vitest'

import { httpsPost, isPublicAddress, sendPages } from './sendApi'

vi.mock('env', () => ({}))

const person = (slug: string) => ({
   kind: 'company' as const,
   slug,
   url: `https://www.linkedin.com/company/${slug}`,
   name: null,
   hiring: [],
})

describe('Send via API', () => {
   it('should only reach public addresses', () => {
      expect(isPublicAddress('8.8.8.8')).toBe(true)
      expect(isPublicAddress('2606:4700::1111')).toBe(true)

      for (const address of [
         '127.0.0.1',
         '10.1.2.3',
         '172.20.0.1',
         '192.168.1.1',
         '169.254.169.254',
         '::1',
         'fd00::1',
         '::ffff:127.0.0.1',
         'not an ip',
      ]) {
         expect(isPublicAddress(address)).toBe(false)
      }
   })

   it('should refuse http and private literal addresses before connecting', async () => {
      await expect(httpsPost('http://example.com/hook', '{}', {})).rejects.toThrow('https://')
      await expect(httpsPost('https://169.254.169.254/latest', '{}', {})).rejects.toThrow('not a public')
   })

   it('should send pages of 1,000, retry a failed page and report what was not accepted', async () => {
      const post = vi
         .fn()
         .mockResolvedValueOnce({ status: 500 })
         .mockResolvedValueOnce({ status: 200 })
         .mockResolvedValue({ status: 503 })
      const items = Array.from({ length: 1_001 }, (_, index) => person(`c${index}`))
      const result = await sendPages(
         {
            url: 'https://example.com/hook',
            secret: '',
            post,
            sleep: async () => undefined,
         },
         {
            workflowId: 'w',
            runId: 'r',
         },
         items
      )

      expect(result).toEqual({
         pages: 2,
         failed: 1,
         error: 'it answered 503',
      })
      expect(post).toHaveBeenCalledTimes(5)
      expect(post.mock.calls[0][2]).toEqual({})
   })
})
