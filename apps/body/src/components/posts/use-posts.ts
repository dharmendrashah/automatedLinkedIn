import { useMemo } from 'react'

import { type RouterInputs, trpc } from '../../trpc'
import { uniqueById } from '../table/sort-param'

export type PostQuery = Omit<RouterInputs['linkedInPost']['list'], 'cursor' | 'page' | 'pageSize'>
export type PostSort = NonNullable<PostQuery['sort']>

export const POST_SORTS: Array<PostSort['by']> = ['createdAt', 'postedAt', 'comments', 'qualified']

// The columns the owner may hide, for the Columns menu; Post, select and actions always show.
export const POST_COLUMNS: Array<[string, string]> = [
   ['people', 'People found'],
   ['engagement', 'Engagement'],
   ['labels', 'Labels'],
   ['createdAt', 'Added'],
   ['readAt', 'Last read'],
]

export const POST_HIDDEN_BY_DEFAULT = { readAt: false }

// Rows asked for per page while scrolling.
const PAGE_SIZE = 50

// The Posts table's rows, page after page as the owner scrolls.
export const usePosts = (query: PostQuery) => {
   const list = trpc.linkedInPost.list.useInfiniteQuery(
      {
         ...query,
         pageSize: PAGE_SIZE,
      },
      {
         retry: false,
         initialCursor: 1,
         getNextPageParam: page => page.nextCursor,
         placeholderData: previous => previous,
      }
   )
   const rows = useMemo(() => uniqueById(list.data?.pages.flatMap(page => page.items) ?? []), [list.data])

   return {
      list,
      rows,
      total: list.data?.pages[0]?.total ?? 0,
   }
}
