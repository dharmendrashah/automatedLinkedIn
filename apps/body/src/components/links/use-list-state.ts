import { useDeferredValue, useState } from 'react'
import { useSearchParams } from 'react-router'

import { type AddedFilter, addedSince, isAddedFilter } from '../labels/added'
import { type LinkStatus } from './types'

export const PAGE_SIZE = 25

export type LabelMatch = 'any' | 'all'

// The search, filters and page of a list. Labels and when added live in the URL, so a filtered view can be shared or
// bookmarked. A new filter starts again from the first page.
export const useListState = <S extends string = LinkStatus>() => {
   const [params, setParams] = useSearchParams()
   const [search, setSearch] = useState('')
   const [status, setStatus] = useState<S | 'all'>('all')
   const [includeArchived, setIncludeArchived] = useState(false)
   const [page, setPage] = useState(1)
   const deferredSearch = useDeferredValue(search)
   const tags = params.get('labels')?.split(',').filter(Boolean) ?? []
   const tagMatch: LabelMatch = params.get('match') === 'all' ? 'all' : 'any'
   const addedParam = params.get('added')
   const added: AddedFilter = isAddedFilter(addedParam) ? addedParam : 'any'

   const setParam = (key: string, value: string | null) => {
      setParams(
         current => {
            const next = new URLSearchParams(current)

            if (value) {
               next.set(key, value)
            } else {
               next.delete(key)
            }

            return next
         },
         { replace: true }
      )
      setPage(1)
   }
   const setTags = (next: string[]) => setParam('labels', next.join(',') || null)

   return {
      search,
      status,
      tags,
      tagMatch,
      added,
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
      setTags,
      addTag: (tag: string) => (tags.includes(tag) ? undefined : setTags([...tags, tag])),
      setTagMatch: (value: LabelMatch) => setParam('match', value === 'all' ? value : null),
      setAdded: (value: AddedFilter) => setParam('added', value === 'any' ? null : value),
      setIncludeArchived: (value: boolean) => {
         setIncludeArchived(value)
         setPage(1)
      },
      query: {
         search: deferredSearch || undefined,
         status: status === 'all' ? undefined : status,
         tags: tags.length > 0 ? tags : undefined,
         tagMatch: tags.length > 1 ? tagMatch : undefined,
         addedSince: addedSince(added),
         includeArchived,
         page,
         pageSize: PAGE_SIZE,
      },
   }
}

export type ListState<S extends string = LinkStatus> = ReturnType<typeof useListState<S>>
