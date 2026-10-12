import { SessionDrawer } from '@/components/sessions/session-drawer'
import { SessionsTable } from '@/components/sessions/sessions-table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router'

import { trpc } from '../trpc'

const results = [
   { value: 'all', label: 'All results' },
   { value: 'SUCCEEDED', label: 'Success' },
   { value: 'FAILED', label: 'Failed' },
   { value: 'IN_PROGRESS', label: 'In progress' },
] as const

// A running session is refreshed every few seconds, so its result appears without a reload.
const REFRESH_MS = 3000

export const Sessions = () => {
   // The open session and the filters live in the address, so a link opens exactly what was being looked at.
   const [params, setParams] = useSearchParams()
   const openId = params.get('session')
   const accountId = params.get('account') ?? 'all'
   const result = params.get('result') ?? 'all'

   const accounts = trpc.linkedInAccount.list.useQuery(undefined, { retry: false })
   const list = trpc.session.list.useInfiniteQuery(
      {
         ...(accountId !== 'all' && { accountId }),
         ...(result !== 'all' && { status: result as 'SUCCEEDED' | 'FAILED' | 'IN_PROGRESS' }),
      },
      {
         retry: false,
         getNextPageParam: page => page.nextCursor,
         refetchInterval: query =>
            query.state.data?.pages.some(page => page.items.some(item => item.status === 'IN_PROGRESS' && !item.noAnswer))
               ? REFRESH_MS
               : false,
      }
   )

   const sessions = useMemo(() => list.data?.pages.flatMap(page => page.items), [list.data])

   const setParam = (name: string, value: string | null) =>
      setParams(
         current => {
            const next = new URLSearchParams(current)

            if (value === null || value === 'all') {
               next.delete(name)
            } else {
               next.set(name, value)
            }

            return next
         },
         { replace: true }
      )

   return (
      <div className="mx-auto grid w-full max-w-5xl gap-4 px-4 lg:px-6">
         <div className="grid gap-1">
            <h2 className="text-lg font-semibold">Sessions</h2>
            <p className="text-muted-foreground text-sm">
               Every check the spider ran for your accounts. Open one to see what happened, watch the video, and try it
               again through another proxy.
            </p>
         </div>

         <div className="flex flex-wrap gap-2">
            <Select value={accountId} onValueChange={value => setParam('account', value)}>
               <SelectTrigger className="w-56" aria-label="Filter by account">
                  <SelectValue />
               </SelectTrigger>
               <SelectContent>
                  <SelectItem value="all">All accounts</SelectItem>
                  {accounts.data?.map(account => (
                     <SelectItem key={account.id} value={account.id}>
                        {account.email}
                     </SelectItem>
                  ))}
               </SelectContent>
            </Select>
            <Select value={result} onValueChange={value => setParam('result', value)}>
               <SelectTrigger className="w-40" aria-label="Filter by result">
                  <SelectValue />
               </SelectTrigger>
               <SelectContent>
                  {results.map(item => (
                     <SelectItem key={item.value} value={item.value}>
                        {item.label}
                     </SelectItem>
                  ))}
               </SelectContent>
            </Select>
         </div>

         <SessionsTable
            sessions={sessions}
            loading={list.isPending}
            error={list.error?.message}
            selectedId={openId}
            hasMore={Boolean(list.hasNextPage)}
            loadingMore={list.isFetchingNextPage}
            onOpen={id => setParam('session', id)}
            onLoadMore={() => void list.fetchNextPage()}
         />

         <SessionDrawer sessionId={openId} onOpen={id => setParam('session', id)} onClose={() => setParam('session', null)} />
      </div>
   )
}
