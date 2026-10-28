import { type RouterOutputs } from '../../trpc/trpc'

type List = RouterOutputs['connections']['list']

export type ConnectionItem = List['connections'][number]
export type ConnectionAccount = List['account']

export type Filter = 'LIST' | 'OVER'

// A connection that was removed, or is not on LinkedIn's list any more, is over: it is kept to say so, but it is not one of the list.
export const isOver = ({ state }: Pick<ConnectionItem, 'state'>) => state === 'REMOVED' || state === 'GONE'

export const countsOf = (rows: Array<Pick<ConnectionItem, 'state'>>): Record<Filter, number> => {
   const over = rows.filter(isOver).length

   return {
      LIST: rows.length - over,
      OVER: over,
   }
}

// What is shown for a view and a search: every word typed must be in the name or the headline, whatever its case.
export const visibleConnections = <T extends Pick<ConnectionItem, 'state' | 'name' | 'headline'>>(
   rows: T[],
   filter: Filter,
   query: string
) => {
   const words = query.toLowerCase().split(/\s+/).filter(Boolean)

   return rows.filter(row => {
      const text = `${row.name} ${row.headline}`.toLowerCase()

      return isOver(row) === (filter === 'OVER') && words.every(word => text.includes(word))
   })
}
