import { describe, expect, it } from 'vitest'

import { DEFAULT_PROTOCOL, SUPPORTED_PROTOCOLS, protocolHint, protocolLabel, protocolOptions } from './protocols'

describe('protocolOptions', () => {
   it('should offer HTTP, HTTPS and SOCKS5', () => {
      expect(SUPPORTED_PROTOCOLS).toEqual(['HTTP', 'HTTPS', 'SOCKS5'])

      for (const current of SUPPORTED_PROTOCOLS) {
         expect(protocolOptions(current)).toEqual(['HTTP', 'HTTPS', 'SOCKS5'])
      }
   })

   it('should keep the SOCKS4 of a stored proxy visible, last', () => {
      expect(protocolOptions('SOCKS4')).toEqual(['HTTP', 'HTTPS', 'SOCKS5', 'SOCKS4'])
   })

   it('should make HTTP the default for a new proxy', () => {
      expect(DEFAULT_PROTOCOL).toBe('HTTP')
      expect(SUPPORTED_PROTOCOLS[0]).toBe(DEFAULT_PROTOCOL)
   })
})

describe('protocolLabel', () => {
   it('should be short enough for the select: only the address start', () => {
      expect(protocolLabel('HTTP')).toBe('http://')
      expect(protocolLabel('HTTPS')).toBe('https://')
      expect(protocolLabel('SOCKS5')).toBe('socks5://')
      expect(protocolLabel('SOCKS4')).toBe('socks4:// (no longer offered)')
   })
})

describe('protocolHint', () => {
   it('should explain each kind in a sentence, and steer an unsure owner to HTTP', () => {
      expect(protocolHint('HTTP')).toContain('http://')
      expect(protocolHint('HTTPS')).toContain('try http://')
      expect(protocolHint('SOCKS5')).toContain('socks5://')
      expect(protocolHint('SOCKS4')).toContain('No longer offered')
   })
})
