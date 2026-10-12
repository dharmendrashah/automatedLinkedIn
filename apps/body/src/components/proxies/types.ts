import { type RouterOutputs } from '../../trpc'

export type Proxy = RouterOutputs['proxyServer']['list'][number]
export type ProxyStatus = Proxy['status']
export type ProxyProtocol = Proxy['protocol']
export type ProxyTestSummary = RouterOutputs['proxyServer']['history'][number]
export type ProxyTestEntry = RouterOutputs['proxyServer']['historyEntry']
