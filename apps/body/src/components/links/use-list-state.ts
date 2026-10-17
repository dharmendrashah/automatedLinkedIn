import { useDeferredValue, useState } from 'react'

import { type LinkStatus } from './types'

export const PAGE_SIZE = 25

// The search, filters and page of a list. A new filter starts again from the first page.
export const useListState = <S extends string = LinkStatus>() => {
   const [search, setSearch] = useState('')
   const [status, setStatus] = useState<S | 'all'>('all')
   const [tag, setTag] = useState<string>()
   const [includeArchived, setIncludeArchived] = useState(false)
   const [page, setPage] = useState(1)
   const deferredSearch = useDeferredValue(search)

   return {
      search,
      status,
      tag,
      includeArchived,
      page,
      setPage,
      setSearch: (value: string) => {
         setSearch(value)
         setPage(1)
      },
      setStatus: (value: S | 'all') => {
         setStatus(value)
         setPage(1)
      },
      setTag: (value: string | undefined) => {
         setTag(value)
         setPage(1)
      },
      setIncludeArchived: (value: boolean) => {
         setIncludeArchived(value)
         setPage(1)
      },
      query: {
         search: deferredSearch || undefined,
         status: status === 'all' ? undefined : status,
         tag,
         includeArchived,
         page,
         pageSize: PAGE_SIZE,
      },
   }
}

export type ListState<S extends string = LinkStatus> = ReturnType<typeof useListState<S>>
