import { type ProxyProtocol } from './types'

export type SupportedProtocol = 'HTTPS' | 'SOCKS5'

// A proxy has to carry HTTPS: every page the spider visits is one. Plain `http://` and SOCKS4 proxies are no longer added.
export const SUPPORTED_PROTOCOLS: ProxyProtocol[] = ['HTTPS', 'SOCKS5']

// What the select lists: the supported ones, plus the stored protocol of an older proxy so it stays visible while editing.
export const protocolOptions = (current: ProxyProtocol) =>
   SUPPORTED_PROTOCOLS.includes(current) ? SUPPORTED_PROTOCOLS : [...SUPPORTED_PROTOCOLS, current]
