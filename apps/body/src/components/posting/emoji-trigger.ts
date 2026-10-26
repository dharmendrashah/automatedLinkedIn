export type EmojiTrigger = {
   // Where the colon is and where the caret is: what is replaced when an emoji is chosen.
   start: number
   end: number
   query: string
}

const QUERY = /^[\p{L}\p{N}_+-]{1,20}$/u

export const EMOJI_LIST_ID = 'emoji-list'
export const emojiOptionId = (index: number) => `emoji-option-${index}`

// An open `:name` just before the caret. The colon must start the text or follow whitespace, so "10:30", "https://" and "Note:wow"
// stay plain text, and the name has no space.
export const triggerAt = (text: string, caret: number): EmojiTrigger | undefined => {
   const colon = text.lastIndexOf(':', caret - 1)

   if (colon < 0 || colon >= caret) {
      return undefined
   }

   const before = text[colon - 1]
   const query = text.slice(colon + 1, caret)

   return (before === undefined || /\s/.test(before)) && QUERY.test(query)
      ? {
           start: colon,
           end: caret,
           query,
        }
      : undefined
}
