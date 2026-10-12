import { describe, expect, it } from 'vitest'

import { SUPPORTED_PROTOCOLS, protocolOptions } from './protocols'

describe('protocolOptions', () => {
   it('should offer only HTTPS and SOCKS5', () => {
      expect(SUPPORTED_PROTOCOLS).toEqual(['HTTPS', 'SOCKS5'])
      expect(protocolOptions('HTTPS')).toEqual(['HTTPS', 'SOCKS5'])
      expect(protocolOptions('SOCKS5')).toEqual(['HTTPS', 'SOCKS5'])
   })

   it.each(['HTTP', 'SOCKS4'] as const)('should keep the %s of a stored proxy visible, last', stored => {
      expect(protocolOptions(stored)).toEqual(['HTTPS', 'SOCKS5', stored])
   })
})
