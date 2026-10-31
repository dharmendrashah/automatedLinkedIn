import { Button } from '@/components/ui/button'
import {
   DropdownMenu,
   DropdownMenuCheckboxItem,
   DropdownMenuContent,
   DropdownMenuLabel,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Columns3 } from 'lucide-react'

import { type HiddenColumns } from './use-hidden-columns'

// The columns the owner may hide, as [id, word]; a column that always shows is left out.
export const ColumnsMenu = ({
   columns,
   hidden,
   onChange,
}: {
   columns: Array<[string, string]>
   hidden: HiddenColumns
   onChange: (next: HiddenColumns) => void
}) => (
   <DropdownMenu>
      <DropdownMenuTrigger asChild>
         <Button variant="outline">
            <Columns3 />
            Columns
         </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
         <DropdownMenuLabel>Show columns</DropdownMenuLabel>
         {columns.map(([id, word]) => (
            <DropdownMenuCheckboxItem
               key={id}
               checked={hidden[id] !== false}
               onCheckedChange={shown =>
                  onChange(
                     shown === true
                        ? Object.fromEntries(Object.entries(hidden).filter(([key]) => key !== id))
                        : {
                             ...hidden,
                             [id]: false,
                          }
                  )
               }
               onSelect={event => event.preventDefault()}
            >
               {word}
            </DropdownMenuCheckboxItem>
         ))}
      </DropdownMenuContent>
   </DropdownMenu>
)
