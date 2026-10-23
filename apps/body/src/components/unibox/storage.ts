export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

const MAX_CHARS = 1_000_000

// What the Unibox keeps on this device (drafts, account sets, the account selection). A browser can refuse storage (private mode, a
// full disk, a policy), and what was saved can be old or edited, so reading never throws and falls back, and writing says whether it
// worked.
export const readJson = <T>(
   storage: StorageLike | undefined,
   key: string,
   parse: (raw: unknown) => T,
   fallback: T
): T => {
   try {
      const text = storage?.getItem(key)

      return text ? parse(JSON.parse(text) as unknown) : fallback
   } catch {
      return fallback
   }
}

export const writeJson = (storage: StorageLike | undefined, key: string, value: unknown) => {
   try {
      const text = JSON.stringify(value)

      if (!storage || text.length > MAX_CHARS) {
         return false
      }

      storage.setItem(key, text)

      return true
   } catch {
      return false
   }
}

export const KEYS = {
   drafts: 'unibox.drafts.v1',
   accountSets: 'unibox.accountSets.v1',
   selection: 'unibox.selection.v1',
   sort: 'unibox.sort.v1',
   density: 'unibox.density.v1',
} as const
