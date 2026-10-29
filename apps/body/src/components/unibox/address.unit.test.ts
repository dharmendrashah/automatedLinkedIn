import { describe, expect, it } from 'vitest'

import { type Address, parseAddress, toAddress } from './address'

const defaults: Address = { view: 'ALL', query: '', sort: 'NEWEST' }

describe('parseAddress', () => {
   it('should read the conversation, the view, the search and the sort from the address', () => {
      expect(parseAddress('/unibox/2-abc%3D%3D', '?view=needs-reply&q=hello%20there&sort=waiting')).toEqual({
         conversationId: '2-abc==',
         view: 'NEEDS_REPLY',
         query: 'hello there',
         sort: 'WAITING',
      })
   })

   it('should use the defaults for what is missing or unknown', () => {
      expect(parseAddress('/unibox', '')).toEqual(defaults)
      expect(parseAddress('/unibox', '?view=nonsense&sort=sideways')).toEqual(defaults)
   })

   it('should not choke on an id that is not a valid encoding, and cut a very long search', () => {
      expect(parseAddress('/unibox/%E0%A4%A', '').conversationId).toBeUndefined()
      expect(parseAddress('/unibox', `?q=${'x'.repeat(500)}`).query).toHaveLength(200)
   })

   it('should read the New message view with the account and the person it names', () => {
      expect(parseAddress('/unibox/new', '')).toEqual({ ...defaults, compose: {} })
      expect(parseAddress('/unibox/new', '?account=a1&to=grace-h&view=unread')).toEqual({
         ...defaults,
         view: 'UNREAD',
         compose: { accountId: 'a1', to: 'grace-h' },
      })
      expect(parseAddress('/unibox/new', `?to=${'x'.repeat(500)}`).compose?.to).toHaveLength(200)
   })
})

describe('toAddress', () => {
   it('should write only what is not the default', () => {
      expect(toAddress(defaults)).toBe('/unibox')
      expect(toAddress({ ...defaults, view: 'DONE' })).toBe('/unibox?view=done')
      expect(toAddress({ conversationId: '2-abc==', view: 'NEEDS_REPLY', query: 'a b', sort: 'WAITING' })).toBe(
         '/unibox/2-abc%3D%3D?view=needs-reply&q=a+b&sort=waiting'
      )
   })

   it('should read back what it wrote', () => {
      const address: Address = { conversationId: 'x/y z', view: 'FAILED', query: 'é&=?', sort: 'WAITING' }
      const [path, search = ''] = toAddress(address).split('?')

      expect(parseAddress(path ?? '', `?${search}`)).toEqual(address)
   })

   it('should write the New message view, and read it back', () => {
      const address: Address = {
         compose: { accountId: 'a 1', to: 'grace-h' },
         view: 'NEEDS_REPLY',
         query: '',
         sort: 'NEWEST',
      }
      const [path, search = ''] = toAddress(address).split('?')

      expect(path).toBe('/unibox/new')
      expect(toAddress({ ...defaults, compose: {} })).toBe('/unibox/new')
      expect(parseAddress(path ?? '', `?${search}`)).toEqual(address)
   })
})
