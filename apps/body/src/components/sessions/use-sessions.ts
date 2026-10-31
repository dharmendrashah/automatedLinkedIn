import { useEffect, useMemo, useRef, useState } from 'react'

import { type SessionRow } from './types'

import { type RouterInputs, trpc } from '../../trpc'

type ListInput = RouterInputs['session']['list']
type Filters = Omit<ListInput, 'sort' | 'cursor'>
export type SessionSort = NonNullable<ListInput['sort']>

// The page looks for what changed this often, and only while the tab is shown (.plan/sessions-page.md).
export const REFRESH_MS = 5000
// Rows still running whose end is looked for in one refresh.
const WATCH_MAX = 100

const byId = (rows: SessionRow[]) => {
   const seen = new Set<string>()

   return rows.filter(({ id }) => !seen.has(id) && Boolean(seen.add(id)))
}

type Pages = { pages: Array<{ items: SessionRow[] }> }

const mapPages = <T extends Pages>(
   data: T | undefined,
   change: (items: SessionRow[], index: number) => SessionRow[]
) =>
   data
      ? {
           ...data,
           pages: data.pages.map((page, index) => ({
              ...page,
              items: change(page.items, index),
           })),
        }
      : data

// The Sessions table's data: pages loaded on scroll, and every few seconds only what changed (new runs and the end of running
// ones) merged in, instead of fetching every loaded page again. New runs go on top of a newest-first list the owner is at the
// top of; otherwise they wait behind `waiting` so rows do not move while being read.
export const useSessions = (filters: Filters, sort: SessionSort | undefined, atTop: boolean) => {
   const utils = trpc.useUtils()
   const input = useMemo<ListInput>(
      () => ({
         ...filters,
         ...(sort && { sort }),
      }),
      [filters, sort]
   )
   const key = JSON.stringify(input)
   const newestFirst = !sort || (sort.by === 'startedAt' && sort.desc)
   const list = trpc.session.list.useInfiniteQuery(input, {
      retry: false,
      getNextPageParam: page => page.nextCursor,
   })
   const [held, setHeld] = useState<{ key: string; rows: SessionRow[] }>({
      key: '',
      rows: [],
   })
   const [openedAt] = useState(() => new Date().toISOString())
   // Another filter or sort is another list: what waited for the old one is not shown.
   const waiting = held.key === key ? held.rows : []
   const rows = useMemo(() => byId(list.data?.pages.flatMap(page => page.items) ?? []), [list.data])
   const since = [...rows, ...waiting].reduce(
      (newest, { startedAt }) => (String(startedAt) > newest ? String(startedAt) : newest),
      openedAt
   )
   const watch = rows
      .filter(({ status, noAnswer }) => status === 'IN_PROGRESS' && !noAnswer)
      .slice(0, WATCH_MAX)
      .map(({ id }) => id)
   const changes = trpc.session.changes.useQuery(
      {
         ...filters,
         since,
         watch,
      },
      {
         enabled: list.isSuccess,
         retry: false,
         refetchInterval: REFRESH_MS,
         refetchIntervalInBackground: false,
      }
   )
   const onTop = useRef(false)

   useEffect(() => {
      onTop.current = atTop && newestFirst
   }, [atTop, newestFirst])

   const prepend = (fresh: SessionRow[]) =>
      utils.session.list.setInfiniteData(input, data =>
         mapPages(data, (items, index) => (index === 0 ? byId([...fresh, ...items]) : items))
      )

   useEffect(() => {
      const { fresh = [], updated = [] } = changes.data ?? {}
      const ended = new Map(updated.map(row => [row.id, row]))

      if (ended.size > 0) {
         utils.session.list.setInfiniteData(input, data =>
            mapPages(data, items => items.map(row => ended.get(row.id) ?? row))
         )
      }

      if (fresh.length === 0) {
         return
      }

      if (onTop.current) {
         utils.session.list.setInfiniteData(input, data =>
            mapPages(data, (items, index) => (index === 0 ? byId([...fresh, ...items]) : items))
         )
      } else {
         setHeld(current => ({
            key,
            rows: byId([...fresh, ...(current.key === key ? current.rows : [])]),
         }))
      }
   }, [changes.data, input, key, utils])

   // Shows the runs that waited: on top of a newest-first list, or by reading the list again in another order.
   const showWaiting = () => {
      if (newestFirst) {
         prepend(waiting)
      } else {
         void list.refetch()
      }

      setHeld({
         key,
         rows: [],
      })
   }

   return {
      rows,
      list,
      waiting: waiting.length,
      showWaiting,
   }
}
