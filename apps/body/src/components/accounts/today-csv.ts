import { cell } from '../posting/posts-csv'
import { ITEMS, type ItemState, KIND_LABEL } from './today'

const HEADER = ['Account', 'Client', 'Item', 'State', 'Last run', 'Last result', 'Next']

// What each account did today and what comes next, one row per account and item, for the owner's own report to a client. Built in
// the browser from the list already on the page; a cell that would run as a formula is kept as text by `cell`.
export const todayCsv = (rows: { email: string; client: string | null; states: ItemState[] }[]) =>
   [
      HEADER,
      ...rows.flatMap(({ email, client, states }) =>
         states.map(state => [
            email,
            client ?? '',
            ITEMS.find(({ item }) => item === state.item)?.title ?? state.item,
            KIND_LABEL[state.kind],
            state.last ?? '',
            state.result ?? '',
            state.next,
         ])
      ),
   ]
      .map(line => line.map(cell).join(','))
      .join('\r\n')
