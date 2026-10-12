import { type RouterOutputs } from '../../trpc'

export type Proxy = RouterOutputs['proxyServer']['list'][number]
export type ProxyStatus = Proxy['status']
export type ProxyProtocol = Proxy['protocol']
