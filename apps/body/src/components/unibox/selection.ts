// Which rows a bulk action is for. "Select all" has two meanings, the rows on the list and everything the filter matches, and they are
// never mixed up: the second is a choice of its own, and the label says how many it is.
export type Selection = {
   ids: ReadonlySet<string>
   // Every row the filter matches, including those not on the list yet.
   all: boolean
}

export const empty: Selection = {
   ids: new Set(),
   all: false,
}

export const clear = (): Selection => empty

export const isSelected = (selection: Selection, id: string) => selection.all || selection.ids.has(id)

export const toggle = (selection: Selection, id: string): Selection => {
   if (selection.all) {
      // One row taken out of "all" leaves no way to say "all but one" for rows not loaded; the list's rows stay selected.
      return { ids: new Set(), all: false }
   }

   const ids = new Set(selection.ids)

   if (!ids.delete(id)) {
      ids.add(id)
   }

   return {
      ids,
      all: false,
   }
}

// Every row from one to the other on the list, both included.
export const range = (selection: Selection, order: string[], from: string, to: string): Selection => {
   const a = order.indexOf(from)
   const b = order.indexOf(to)

   if (a < 0 || b < 0) {
      return {
         ids: new Set([...selection.ids, ...(order.includes(to) ? [to] : [])]),
         all: false,
      }
   }

   return {
      ids: new Set([...selection.ids, ...order.slice(Math.min(a, b), Math.max(a, b) + 1)]),
      all: false,
   }
}

export const selectVisible = (order: string[]): Selection => ({
   ids: new Set(order),
   all: false,
})

export const selectAllMatching = (): Selection => ({
   ids: new Set(),
   all: true,
})

export const describeSelection = (selection: Selection, visible: number, matching: number) =>
   selection.all
      ? { label: `All ${matching.toLocaleString('en-US')} selected`, canSelectAllMatching: false }
      : {
           label: `${selection.ids.size} selected`,
           canSelectAllMatching: matching > visible && selection.ids.size >= visible,
        }

// The ids a bulk action is for: those selected that are still on the list (in its order), or every one it matches.
export const resolve = (selection: Selection, matchingIds: string[]) =>
   selection.all ? matchingIds : matchingIds.filter(id => selection.ids.has(id))
