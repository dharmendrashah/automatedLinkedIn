import { type Chip, isChip } from './toolbar'

export type Address = {
   q: string
   client: string
   chip: Chip
   // null when the owner did not say, so the remembered choice applies (off by default).
   group: boolean | null
   open: string | null
   panel: 'activity' | null
   // A client whose accounts the bottom drawer shows together.
   activity: string | null
}

const ID = /^[\w-]{1,64}$/
const TEXT_MAX = 100

const textOf = (value: string | null) => (value ?? '').slice(0, TEXT_MAX)

// What the address says about the list and its drawers. Anything it does not know is ignored, so a bad address shows the plain list.
export const readAddress = (params: URLSearchParams): Address => {
   const chip = params.get('status')
   const open = params.get('open')
   const group = params.get('group')
   const activity = textOf(params.get('activity')).trim()
   const validOpen = open !== null && ID.test(open) ? open : null

   return {
      q: textOf(params.get('q')),
      client: textOf(params.get('client')),
      chip: isChip(chip) ? chip : 'all',
      group: group === 'client' ? true : group === 'off' ? false : null,
      open: validOpen,
      panel: validOpen && params.get('panel') === 'activity' ? 'activity' : null,
      activity: activity === '' ? null : activity,
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

   if (change.client !== undefined) {
      put(next, 'client', change.client)
   }

   if (change.chip !== undefined) {
      put(next, 'status', change.chip === 'all' ? null : change.chip)
   }

   if (change.group !== undefined) {
      put(next, 'group', change.group === null ? null : change.group ? 'client' : 'off')
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

   if (change.activity !== undefined) {
      put(next, 'activity', change.activity)
   }

   return next
}
