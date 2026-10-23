// A hue (0 to 359) for an account, the same every time, so an account keeps its colour. The name is always shown as well: colours
// collide when there are hundreds of accounts, so they only help the eye.
export const hueOf = (id: string) => {
   let hash = 2166136261

   for (const char of id) {
      hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619)
   }

   return Math.abs(hash) % 360
}

// The first letters of the first and the last word of a name, ignoring flags and emoji.
export const initialsOf = (name: string) => {
   const words = name
      .split(/\s+/)
      .map(word => word.replace(/[^\p{L}\p{N}]/gu, ''))
      .filter(Boolean)
   const first = words[0]
   const last = words.length > 1 ? words.at(-1) : undefined

   return first ? `${first[0]}${last?.[0] ?? ''}`.toUpperCase() : '?'
}
