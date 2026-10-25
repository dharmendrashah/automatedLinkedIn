import type { PostBlock } from '@automatedLinkedIn/contracts'

import { joinedText, mediaBlock } from './rules'

const SHOWN = 90

// A draft in one line for the list: its first words and what it carries.
export const summaryOf = (blocks: PostBlock[]) => {
   const flat = joinedText(blocks).replace(/\s+/g, ' ').trim()
   const media = mediaBlock(blocks)
   const characters = Array.from(flat)
   const attachment =
      media?.type === 'PHOTOS'
         ? `${media.items.length} ${media.items.length === 1 ? 'photo' : 'photos'}`
         : media?.type === 'VIDEO'
           ? 'Video'
           : media?.type === 'DOCUMENT'
             ? `Document ${media.file.name}`
             : media?.type === 'LINK' && URL.canParse(media.url)
               ? `Link to ${new URL(media.url).hostname}`
               : undefined

   return {
      words:
         flat === ''
            ? attachment
               ? 'No words yet'
               : 'Empty draft'
            : characters.length > SHOWN
              ? `${characters.slice(0, SHOWN).join('').trimEnd()}…`
              : flat,
      attachment,
   }
}
