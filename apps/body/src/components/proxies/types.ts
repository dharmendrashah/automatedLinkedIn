import { type RouterOutputs } from '../../trpc'

export type Proxy = RouterOutputs['proxyServer']['list'][number]
export type ProxyStatus = Proxy['status']
export type ProxyProtocol = Proxy['protocol']
export type ProxyTestEntry = RouterOutputs['proxyServer']['historyEntry']

// Everything a proxy's card, row or drawer can ask the page to do. The page owns the requests; these only ask.
export type ProxyHandlers = {
   // The proxy a request is running for, to show a spinner on its buttons.
   busyId: string | undefined
   // Whether the spider worker has announced the browser check (nothing else knows whether a worker runs).
   browserTestAnnounced: boolean
   onDetails: (proxy: Proxy) => void
   onTest: (proxy: Proxy) => void
   onBrowserTest: (proxy: Proxy) => void
   onEdit: (proxy: Proxy) => void
   onDelete: (proxy: Proxy) => void
   onUseInstead: (target: Proxy) => void
   onReplace: (proxy: Proxy) => void
   onAccept: (proxy: Proxy) => void
   onUndoAccept: (proxy: Proxy) => void
}
