export const ADDRESS_PROBLEM = 'Use an address that starts with https://, or a site name such as example.com.'

// A site name with at least one dot and a letter ending, no spaces, and anything after it that is a path.
const BARE = /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/?#]\S*)?$/i

// The https address a person means by what they typed or selected, or nothing when it is not one. A bare `example.com` gets https;
// `http://` and every other scheme are refused.
export const normaliseAddress = (value: string) => {
   const text = value.trim()

   if (/^https:\/\//i.test(text)) {
      return URL.canParse(text) && !/\s/.test(text) ? text : undefined
   }

   return BARE.test(text) && URL.canParse(`https://${text}`) ? `https://${text}` : undefined
}

// A sentence for an address field; nothing for an empty one (the button stays off) or a good one.
export const addressProblem = (value: string) =>
   value.trim() === '' || normaliseAddress(value) ? undefined : ADDRESS_PROBLEM

// The text with the address after the selection (or at the caret when nothing is selected), a space on either side only where one
// is missing, and the caret after the address.
export const withAddress = (text: string, end: number, url: string) => {
   const before = text.slice(0, end)
   const after = text.slice(end)
   const lead = before === '' || /\s$/.test(before) ? '' : ' '
   const trail = after === '' || /^\s/.test(after) ? '' : ' '
   const added = `${lead}${url}${trail}`

   return {
      value: `${before}${added}${after}`,
      caret: before.length + lead.length + url.length,
   }
}
