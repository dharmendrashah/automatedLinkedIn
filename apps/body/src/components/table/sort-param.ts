// A table's sort in the address, as `field.asc` or `field.desc`; nothing (or a field not allowed) is the default order.
export type SortParam<F extends string> = { by: F; desc: boolean }

export const readSort = <F extends string>(value: string | null, allowed: readonly F[]): SortParam<F> | undefined => {
   const [field, direction] = (value ?? '').split('.')
   const by = allowed.find(item => item === field)

   return by
      ? {
           by,
           desc: direction === 'desc',
        }
      : undefined
}

export const writeSort = <F extends string>(sort: SortParam<F> | undefined) =>
   sort ? `${sort.by}.${sort.desc ? 'desc' : 'asc'}` : null

// Rows of every loaded page, once each: a row can come back on the next page when rows were added meanwhile.
export const uniqueById = <T extends { id: string }>(rows: T[]) => {
   const seen = new Set<string>()

   return rows.filter(({ id }) => !seen.has(id) && Boolean(seen.add(id)))
}
