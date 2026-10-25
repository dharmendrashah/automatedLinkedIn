export type TextPart = {
   kind: 'text' | 'hashtag' | 'link'
   value: string
}

// A hashtag starts a word and holds letters (any script), marks, digits or underscores. A number sign inside a word ("C#") or alone
// is not one.
const TOKEN = /(?<![\p{L}\p{M}\p{N}_])(#[\p{L}\p{M}\p{N}_]+)|(https?:\/\/[^\s]+)/gu
const TRAILING = /[.,;:!?)\]}'"]+$/

// The words of a post cut into the parts the preview colours: plain text, hashtags and links.
export const splitText = (text: string): TextPart[] => {
   const parts: TextPart[] = []
   let last = 0

   const plain = (end: number) => {
      if (end > last) {
         parts.push({
            kind: 'text',
            value: text.slice(last, end),
         })
      }
   }

   for (const match of text.matchAll(TOKEN)) {
      const [raw, hashtag] = match
      const value = hashtag ? raw : raw.replace(TRAILING, '')

      plain(match.index)
      parts.push({
         kind: hashtag ? 'hashtag' : 'link',
         value,
      })
      last = match.index + value.length
   }

   plain(text.length)

   return parts
}

// Where LinkedIn folds a long post behind "see more": about three lines or this many characters, whichever comes first. The
// numbers are an estimate from what the feed shows, so the preview says it is approximate.
export const SEE_MORE = {
   chars: 210,
   lines: 3,
}

export const seeMore = (text: string) => {
   const lines = text.split('\n')
   const byLines = lines.length > SEE_MORE.lines ? lines.slice(0, SEE_MORE.lines).join('\n') : text
   const characters = Array.from(byLines)

   if (characters.length <= SEE_MORE.chars) {
      return {
         shown: byLines,
         cut: byLines.length < text.length,
      }
   }

   const head = characters.slice(0, SEE_MORE.chars).join('')
   const atWord = head.lastIndexOf(' ')
   const shown = (atWord > SEE_MORE.chars / 2 ? head.slice(0, atWord) : head).trimEnd()

   return {
      shown,
      cut: true,
   }
}
