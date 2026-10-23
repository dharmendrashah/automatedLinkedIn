// A named selection of accounts that the owner picks once and reuses ("the accounts of one client"), kept on this device. There is no
// client model behind it: a set is only a list of account ids.
export type AccountSet = {
   id: string
   name: string
   accountIds: string[]
}

type Result = { ok: true; sets: AccountSet[] } | { ok: false; reason: string }

const MAX_SETS = 50
const MAX_NAME = 40

const unique = (ids: string[]) => [...new Set(ids)]

const taken = (sets: AccountSet[], name: string, exceptId?: string) =>
   sets.some(set => set.id !== exceptId && set.name.toLowerCase() === name.toLowerCase())

const problem = (sets: AccountSet[], name: string, accountIds: string[], exceptId?: string) => {
   if (!name) {
      return 'Give the set a name.'
   }

   if (taken(sets, name, exceptId)) {
      return 'A set with this name already exists.'
   }

   return accountIds.length === 0 ? 'Pick at least one account first.' : undefined
}

export const addSet = (sets: AccountSet[], rawName: string, accountIds: string[], newId: () => string): Result => {
   const name = rawName.trim().slice(0, MAX_NAME)
   const ids = unique(accountIds)
   const reason = problem(sets, name, ids)

   if (reason) {
      return { ok: false, reason }
   }

   if (sets.length >= MAX_SETS) {
      return { ok: false, reason: `You can keep up to ${MAX_SETS} sets.` }
   }

   return {
      ok: true,
      sets: [...sets, { id: newId(), name, accountIds: ids }],
   }
}

export const renameSet = (sets: AccountSet[], id: string, rawName: string): Result => {
   const name = rawName.trim().slice(0, MAX_NAME)
   const reason = problem(sets, name, ['-'], id)

   return reason ? { ok: false, reason } : { ok: true, sets: sets.map(set => (set.id === id ? { ...set, name } : set)) }
}

export const updateSet = (sets: AccountSet[], id: string, accountIds: string[]): Result =>
   accountIds.length === 0
      ? { ok: false, reason: 'Pick at least one account first.' }
      : { ok: true, sets: sets.map(set => (set.id === id ? { ...set, accountIds: unique(accountIds) } : set)) }

export const deleteSet = (sets: AccountSet[], id: string) => sets.filter(set => set.id !== id)

// The accounts of a set that still exist, and how many it names that are gone (an account removed since the set was saved).
export const applySet = (set: AccountSet, knownIds: ReadonlySet<string>) => {
   const selected = new Set(set.accountIds.filter(id => knownIds.has(id)))

   return {
      selected,
      missing: set.accountIds.length - selected.size,
   }
}

// The set that is exactly the accounts selected now, so its name can be shown as active.
export const setMatching = (sets: AccountSet[], selection: ReadonlySet<string> | undefined) =>
   selection
      ? sets.find(set => set.accountIds.length === selection.size && set.accountIds.every(id => selection.has(id)))
      : undefined

// Reads what was saved, which may be old, edited or damaged: what is not a set is dropped, never thrown on.
export const parseSets = (raw: unknown): AccountSet[] => {
   if (!Array.isArray(raw)) {
      return []
   }

   const seen = new Set<string>()
   const sets: AccountSet[] = []

   for (const item of raw as unknown[]) {
      if (typeof item !== 'object' || item === null) {
         continue
      }

      const { id, name, accountIds } = item as Record<string, unknown>

      if (
         typeof id !== 'string' ||
         typeof name !== 'string' ||
         !name.trim() ||
         !Array.isArray(accountIds) ||
         seen.has(id)
      ) {
         continue
      }

      const ids = unique((accountIds as unknown[]).filter((value): value is string => typeof value === 'string'))

      if (ids.length > 0) {
         seen.add(id)
         sets.push({ id, name: name.trim().slice(0, MAX_NAME), accountIds: ids })
      }
   }

   return sets.slice(0, MAX_SETS)
}
