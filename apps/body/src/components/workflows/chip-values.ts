// How a block's list settings take values: pasted lists split into chips, sites and links cleaned or refused, and a
// short built-in list of common titles and places to pick from.

export type ChipKind = 'titles' | 'locations' | 'links' | 'domains'

export const TITLES = [
   'Founder',
   'Co-founder',
   'CEO',
   'CTO',
   'COO',
   'CFO',
   'CMO',
   'CRO',
   'Owner',
   'Managing Director',
   'General Manager',
   'President',
   'Partner',
   'VP Sales',
   'VP Marketing',
   'VP Engineering',
   'VP Product',
   'VP Operations',
   'Head of Sales',
   'Head of Marketing',
   'Head of Growth',
   'Head of Product',
   'Head of Engineering',
   'Head of Operations',
   'Head of People',
   'Head of Partnerships',
   'Director of Sales',
   'Director of Marketing',
   'Sales Director',
   'Marketing Director',
   'Sales Manager',
   'Marketing Manager',
   'Account Executive',
   'Business Development Manager',
   'Product Manager',
   'Engineering Manager',
   'Recruiter',
   'Talent Acquisition',
   'HR Manager',
   'Consultant',
] as const

export const LOCATIONS = [
   'United States',
   'United Kingdom',
   'Canada',
   'Australia',
   'Germany',
   'France',
   'Netherlands',
   'Spain',
   'Italy',
   'Sweden',
   'Switzerland',
   'Ireland',
   'India',
   'Singapore',
   'United Arab Emirates',
   'Israel',
   'Brazil',
   'Mexico',
   'Japan',
   'New Zealand',
   'New York',
   'San Francisco',
   'Los Angeles',
   'Chicago',
   'Austin',
   'Boston',
   'Toronto',
   'London',
   'Berlin',
   'Paris',
   'Amsterdam',
   'Madrid',
   'Stockholm',
   'Dublin',
   'Bangalore',
   'Mumbai',
   'Delhi',
   'Dubai',
   'Sydney',
   'Tel Aviv',
] as const

const SUGGESTIONS: Partial<Record<ChipKind, readonly string[]>> = {
   titles: TITLES,
   locations: LOCATIONS,
}

const SHOWN = 8

// Built-in values that contain what was typed, starting-with first, without the ones already chosen.
export const suggestionsFor = (kind: ChipKind | undefined, typed: string, chosen: string[]) => {
   const words = typed.trim().toLowerCase()
   const taken = new Set(chosen.map(value => value.toLowerCase()))

   return (kind ? (SUGGESTIONS[kind] ?? []) : [])
      .filter(value => !taken.has(value.toLowerCase()) && value.toLowerCase().includes(words))
      .sort((a, b) => Number(b.toLowerCase().startsWith(words)) - Number(a.toLowerCase().startsWith(words)))
      .slice(0, SHOWN)
}

// New lines, commas, tabs and semicolons all separate values, so a pasted column or list becomes many chips.
export const splitValues = (text: string) =>
   text
      .split(/[\n\r,;\t]+/)
      .map(value => value.trim())
      .filter(Boolean)

const LINKEDIN = /^(https?:\/\/)?([a-z]{2,3}\.)?linkedin\.com\/(in|company|school|showcase)\/[^\s/?#]+/i

// A value as it is kept, or null when it cannot be one, such as a link that is not on LinkedIn.
export const cleanValue = (kind: ChipKind | undefined, raw: string) => {
   const value = raw.trim()

   if (!value) {
      return null
   }

   if (kind === 'domains') {
      const domain = value
         .toLowerCase()
         .replace(/^https?:\/\//, '')
         .replace(/^www\./, '')
         .split(/[/?#]/)[0]

      return domain && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain) ? domain : null
   }

   if (kind === 'links') {
      return LINKEDIN.test(value) ? value.replace(/[?#].*$/, '') : null
   }

   return value
}

// Adds what was typed or pasted: the values kept, and the ones refused so they can be shown.
export const addValues = (kind: ChipKind | undefined, current: string[], text: string, max: number) => {
   const known = new Set(current.map(value => value.toLowerCase()))
   const added: string[] = []
   const refused: string[] = []

   for (const raw of splitValues(text)) {
      const value = cleanValue(kind, raw)

      if (value === null) {
         refused.push(raw)
      } else if (!known.has(value.toLowerCase())) {
         known.add(value.toLowerCase())
         added.push(value)
      }
   }

   return {
      values: [...current, ...added].slice(0, max),
      refused,
   }
}
