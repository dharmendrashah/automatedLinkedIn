// Lower case and without accents, so "Ruédiger" is found by "ruediger".
export const fold = (text: string) =>
   text
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()

export const tokensOf = (query: string) => fold(query).split(/\s+/).filter(Boolean)

// Every word must be somewhere in the (already folded) text.
export const matches = (folded: string, tokens: string[]) => tokens.every(token => folded.includes(token))

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export type Piece = {
   text: string
   match: boolean
}

// The text in pieces, those that match a word marked, so a result can show why it was found. Words are plain text, never a pattern.
export const highlight = (text: string, tokens: string[]): Piece[] => {
   if (!text) {
      return []
   }

   if (tokens.length === 0) {
      return [{ text, match: false }]
   }

   const pattern = new RegExp(`(${tokens.map(escape).join('|')})`, 'gi')

   return text
      .split(pattern)
      .filter(piece => piece !== '')
      .map(piece => ({
         text: piece,
         match: tokens.some(token => piece.toLowerCase() === token),
      }))
}
