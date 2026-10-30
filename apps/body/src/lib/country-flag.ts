const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const REGIONAL_A = 0x1f1e6

let codes: Map<string, string> | undefined

// Country names (English, as LinkedIn and the data supplier write them) to their two-letter codes, built once from the browser.
const codeOf = (name: string) => {
   if (!codes) {
      const names = new Intl.DisplayNames(['en'], { type: 'region' })
      const found = new Map<string, string>()

      for (const first of LETTERS) {
         for (const second of LETTERS) {
            const code = `${first}${second}`
            const name = names.of(code)?.toLowerCase()

            // The first code wins: FR before the old FX, which the browser also names "France".
            if (name && name !== code.toLowerCase() && !found.has(name)) {
               found.set(name, code)
            }
         }
      }

      codes = found
   }

   return codes.get(name.trim().toLowerCase())
}

// The flag emoji of a country, or null when the name is not one.
export const flagOf = (country: string | null) => {
   const code = country ? codeOf(country) : undefined

   return code ? String.fromCodePoint(...[...code].map(letter => REGIONAL_A + LETTERS.indexOf(letter))) : null
}
