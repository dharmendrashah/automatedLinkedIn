import { useMemo } from 'react'

import { type Company } from './types'

import { type RouterInputs, trpc } from '../../trpc'

export type CompanyQuery = Omit<RouterInputs['linkedInCompany']['list'], 'cursor' | 'page' | 'pageSize'>
export type CompanySort = NonNullable<CompanyQuery['sort']>

// The columns the owner may hide, for the Columns menu; Company, select and actions always show.
export const COMPANY_COLUMNS: Array<[string, string]> = [
   ['industry', 'Industry'],
   ['country', 'Country'],
   ['size', 'Size'],
   ['followers', 'Followers'],
   ['website', 'Website'],
   ['status', 'Status'],
   ['createdAt', 'Added'],
   ['readAt', 'Last read'],
]

// Rows asked for per page while scrolling.
const PAGE_SIZE = 50

const byId = (rows: Company[]) => {
   const seen = new Set<string>()

   return rows.filter(({ id }) => !seen.has(id) && Boolean(seen.add(id)))
}

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
   const rows = useMemo(() => byId(list.data?.pages.flatMap(page => page.items) ?? []), [list.data])

   return {
      list,
      rows,
      total: list.data?.pages[0]?.total ?? 0,
   }
}
