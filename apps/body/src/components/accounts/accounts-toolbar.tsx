import { Button } from '@/components/ui/button'
import {
   DropdownMenu,
   DropdownMenuCheckboxItem,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ChevronDown, Columns3, Download } from 'lucide-react'

import { COLUMNS, type ColumnId, toggleColumn } from './columns'
import { CHIPS, type Chip, MAIN_CHIPS } from './toolbar'

type Props = {
   q: string
   onQ: (value: string) => void
   chip: Chip
   onChip: (value: Chip) => void
   counts: Record<Chip, number>
   columns: ColumnId[]
   onColumns: (value: ColumnId[]) => void
   // A spreadsheet of what the accounts shown did today.
   onExport: () => void
   canExport: boolean
}

// Find an account and narrow the list: words, one chip and which optional columns show. The four
// browsing counts and Paused sit under More; the chip in use is always shown.
export const AccountsToolbar = ({ q, onQ, chip, onChip, counts, columns, onColumns, onExport, canExport }: Props) => {
   const shown = MAIN_CHIPS.includes(chip) ? MAIN_CHIPS : [...MAIN_CHIPS, chip]
   const more = CHIPS.filter(item => !shown.includes(item.chip))

   return (
      <div className="grid gap-3">
         <div className="flex flex-wrap items-center gap-3">
            <Input
               type="search"
               aria-label="Search accounts"
               placeholder="Search by email or name"
               className="w-64"
               maxLength={100}
               value={q}
               onChange={event => onQ(event.target.value)}
            />
            <Button
               variant="outline"
               size="sm"
               className="ml-auto"
               disabled={!canExport}
               title="Downloads what the accounts shown did today and what comes next, as a spreadsheet file."
               onClick={onExport}
            >
               <Download />
               Export today
            </Button>
            <DropdownMenu>
               <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                     <Columns3 />
                     Columns
                  </Button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {COLUMNS.map(({ id, label }) => (
                     <DropdownMenuCheckboxItem
                        key={id}
                        checked={columns.includes(id)}
                        onCheckedChange={() => onColumns(toggleColumn(columns, id))}
                        onSelect={event => event.preventDefault()}
                     >
                        {label}
                     </DropdownMenuCheckboxItem>
                  ))}
               </DropdownMenuContent>
            </DropdownMenu>
         </div>
         <div role="group" aria-label="Filter accounts" className="flex flex-wrap items-center gap-2">
            {CHIPS.filter(item => shown.includes(item.chip)).map(item => (
               <Tooltip key={item.chip}>
                  <TooltipTrigger asChild>
                     <Button
                        variant={chip === item.chip ? 'default' : 'outline'}
                        size="sm"
                        aria-pressed={chip === item.chip}
                        onClick={() => onChip(chip === item.chip ? 'all' : item.chip)}
                     >
                        {item.label}
                        <span className="tabular-nums">{counts[item.chip]}</span>
                     </Button>
                  </TooltipTrigger>
                  <TooltipContent>{item.rule}</TooltipContent>
               </Tooltip>
            ))}
            {more.length > 0 ? (
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <Button variant="outline" size="sm">
                        More
                        <ChevronDown />
                     </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                     {more.map(item => (
                        <DropdownMenuItem key={item.chip} onSelect={() => onChip(item.chip)} title={item.rule}>
                           {item.label}
                           <span className="text-muted-foreground ml-auto tabular-nums">{counts[item.chip]}</span>
                        </DropdownMenuItem>
                     ))}
                  </DropdownMenuContent>
               </DropdownMenu>
            ) : null}
         </div>
      </div>
   )
}
