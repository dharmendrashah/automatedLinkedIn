import { type Chip, isChip } from './toolbar'

export type Address = {
   q: string
   chip: Chip
   open: string | null
   panel: 'activity' | null
}

const ID = /^[\w-]{1,64}$/
const TEXT_MAX = 100

const textOf = (value: string | null) => (value ?? '').slice(0, TEXT_MAX)

// What the address says about the list and its drawers. Anything it does not know is ignored, so a bad address shows the plain list.
export const readAddress = (params: URLSearchParams): Address => {
   const chip = params.get('status')
   const open = params.get('open')
   const validOpen = open !== null && ID.test(open) ? open : null

   return {
      q: textOf(params.get('q')),
      chip: isChip(chip) ? chip : 'all',
      open: validOpen,
      panel: validOpen && params.get('panel') === 'activity' ? 'activity' : null,
   }
}

const put = (params: URLSearchParams, key: string, value: string | null) => {
   if (value) {
      params.set(key, value)
   } else {
      params.delete(key)
   }
}

// The address with the change applied; a default value is left out, and parameters this does not own (such as `browse`) stay.
export const writeAddress = (current: URLSearchParams, change: Partial<Address>) => {
   const next = new URLSearchParams(current)

   if (change.q !== undefined) {
      put(next, 'q', change.q.trim() === '' ? null : change.q)
   }

   if (change.chip !== undefined) {
      put(next, 'status', change.chip === 'all' ? null : change.chip)
   }

   if (change.open !== undefined) {
      put(next, 'open', change.open)

      if (change.open === null) {
         next.delete('panel')
      }
   }

   if (change.panel !== undefined) {
      put(next, 'panel', change.panel)
   }

   return next
}
