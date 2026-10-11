const VALUE = /^[A-Za-z0-9_\-+/=%.~:]{20,2048}$/
const BARE = /^[A-Za-z0-9_\-+/%.~:]+={0,2}$/
const PAIR = /(?:^|[;\s])li_at\s*=\s*(?:"([^"]*)"|([^;\s"]*))/

const NOT_FOUND =
   "We couldn't find the li_at cookie in what you pasted. Paste the li_at value, or copy all the cookies and paste them here."
const INCOMPLETE =
   'The li_at value looks incomplete. It is a long string of letters and numbers, usually starting with AQ.'

const strip = (text: string) => text.trim().replace(/^"(.*)"$/s, '$1')

type CookieLike = { name?: unknown; value?: unknown }

const fromJson = (text: string): string | undefined => {
   try {
      const parsed: unknown = JSON.parse(text)
      const list = Array.isArray(parsed) ? parsed : (parsed as { cookies?: unknown } | null)?.cookies
      const cookie = Array.isArray(list)
         ? (list as CookieLike[]).find(item => item?.name === 'li_at' && typeof item.value === 'string')
         : undefined

      return typeof cookie?.value === 'string' ? cookie.value : undefined
   } catch {
      return undefined
   }
}

// Cookie table rows and Netscape files are tab separated: the name cell is followed by its value.
const fromTabs = (text: string) => {
   for (const line of text.split(/\r?\n/)) {
      const cells = line.split('\t')
      const index = cells.findIndex(cell => cell.trim() === 'li_at')

      if (index !== -1 && cells[index + 1]) {
         return cells[index + 1]
      }
   }

   return undefined
}

const fromPairs = (text: string) => {
   const match = PAIR.exec(text)

   return match ? (match[1] ?? match[2]) : undefined
}

// Finds the li_at value in a bare token, a Cookie or Set-Cookie string, a JSON export, cookies.txt or table rows.
// Errors state the rule and never echo the input, because it is a secret.
export const extractLiAt = (input: string) => {
   const text = input.trim()
   const looksLikeJson = text.startsWith('[') || text.startsWith('{')

   const found =
      (looksLikeJson ? fromJson(text) : undefined) ??
      fromTabs(text) ??
      fromPairs(text) ??
      (BARE.test(strip(text)) ? strip(text) : undefined)

   if (found === undefined) {
      throw new Error(NOT_FOUND)
   }

   const value = strip(found)

   if (!VALUE.test(value)) {
      throw new Error(INCOMPLETE)
   }

   return value
}
