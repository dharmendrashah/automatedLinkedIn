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

// Result always shows, so it is not offered.
const COLUMN_WORDS: Array<[string, string]> = [
   ['action', 'Action'],
   ['account', 'Account'],
   ['trigger', 'Started by'],
   ['proxy', 'Proxy'],
   ['detail', 'Detail'],
   ['startedAt', 'Started'],
   ['durationMs', 'Took'],
   ['files', 'Files'],
]

export const ColumnsMenu = ({
   hidden,
   onChange,
}: {
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
         {COLUMN_WORDS.map(([id, word]) => (
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
