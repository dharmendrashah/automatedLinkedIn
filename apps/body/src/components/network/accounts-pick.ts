// Which accounts the page shows: all the signed-in ones, or the ones the owner narrowed it to. The narrowing is kept in the address
// as `?accounts=a,b`, and an empty one means all.

export const pickedFrom = (value: string | null) =>
   (value ?? '')
      .split(',')
      .map(id => id.trim())
      .filter(id => id !== '')

// The accounts to ask for: the picked ones that can be read, in the order of the account list, or every readable account when none
// is picked. Ids in the address that are not the owner's, or cannot be read, are left out; when nothing is left nothing is shown.
export const shownAccounts = (usableIds: string[], picked: string[]) =>
   picked.length === 0 ? usableIds : usableIds.filter(id => picked.includes(id))

// The picked accounts after one is checked or unchecked: the last one cannot be unchecked, and all of them is the same as none picked.
export const toggleAccount = (usableIds: string[], shown: string[], id: string) => {
   const next = shown.includes(id) ? shown.filter(other => other !== id) : [...shown, id]

   if (next.length === 0) {
      return shown.length === usableIds.length ? [] : shown
   }

   const ordered = usableIds.filter(other => next.includes(other))

   return ordered.length === usableIds.length ? [] : ordered
}
