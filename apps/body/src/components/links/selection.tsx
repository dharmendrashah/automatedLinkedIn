import { Checkbox } from '@/components/ui/checkbox'
import { TableCell, TableHead } from '@/components/ui/table'

import { type Selection } from './use-selection'

// Picking rows for a bulk action: a checkbox on each row and one for the whole page.

export const SelectAllHead = ({ ids, selection, noun }: { ids: string[]; selection: Selection; noun: string }) => (
   <TableHead className="w-10">
      <Checkbox
         aria-label={`Select every ${noun} on this page`}
         checked={ids.length > 0 && ids.every(id => selection.selected.has(id))}
         onCheckedChange={checked => selection.select(ids, checked === true)}
      />
   </TableHead>
)

export const SelectCell = ({ id, name, selection }: { id: string; name: string; selection: Selection }) => (
   <TableCell>
      <Checkbox
         aria-label={`Select ${name}`}
         checked={selection.selected.has(id)}
         onCheckedChange={checked => selection.select([id], checked === true)}
      />
   </TableCell>
)
