import { type ProxyProtocol } from './types'

export type SupportedProtocol = 'HTTP' | 'HTTPS' | 'SOCKS5'

// The kinds a proxy can be added as. HTTP is the common one: a plain http:// address that still carries secure sites.
// SOCKS4 is no longer offered.
export const SUPPORTED_PROTOCOLS: ProxyProtocol[] = ['HTTP', 'HTTPS', 'SOCKS5']

export const DEFAULT_PROTOCOL: ProxyProtocol = 'HTTP'

const HINTS: Partial<Record<ProxyProtocol, string>> = {
   HTTP: "The usual kind: a plain http:// address that still carries secure sites. Choose it if your provider's example starts with http://.",
   HTTPS: 'A secure connection to the proxy itself. This is rare: if the test fails, try http://.',
   SOCKS5: 'A SOCKS5 proxy, which usually has a socks5:// address.',
}

// Only the start of the address: the select has to stay narrow, the explanation goes in the hint below it.
export const protocolLabel = (protocol: ProxyProtocol) =>
   SUPPORTED_PROTOCOLS.includes(protocol)
      ? `${protocol.toLowerCase()}://`
      : `${protocol.toLowerCase()}:// (no longer offered)`

export const protocolHint = (protocol: ProxyProtocol) =>
   HINTS[protocol] ?? 'No longer offered. Pick another kind to change it.'

// What the select lists: the supported ones, plus the stored protocol of an older proxy so it stays visible while editing.
export const protocolOptions = (current: ProxyProtocol) =>
   SUPPORTED_PROTOCOLS.includes(current) ? SUPPORTED_PROTOCOLS : [...SUPPORTED_PROTOCOLS, current]
