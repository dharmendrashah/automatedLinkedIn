import { useMemo } from 'react'

import { type RouterInputs, trpc } from '../../trpc'
import { uniqueById } from '../table/sort-param'

export type CompanyQuery = Omit<RouterInputs['linkedInCompany']['list'], 'cursor' | 'page' | 'pageSize'>
export type CompanySort = NonNullable<CompanyQuery['sort']>

// The columns the owner may hide, for the Columns menu; Company, select and actions always show.
export const COMPANY_COLUMNS: Array<[string, string]> = [
   ['industry', 'Industry'],
   ['country', 'Country'],
   ['size', 'Size'],
   ['followers', 'Followers'],
   ['website', 'Website'],
   ['people', 'People'],
   ['status', 'Status'],
   ['labels', 'Labels'],
   ['createdAt', 'Added'],
   ['readAt', 'Last read'],
]

// Rows asked for per page while scrolling.
const PAGE_SIZE = 50

// The Companies table's rows, page after page as the owner scrolls; a row seen twice (rows added meanwhile) shows once.
export const useCompanies = (query: CompanyQuery) => {
   const list = trpc.linkedInCompany.list.useInfiniteQuery(
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
