import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Check, ChevronsUpDown } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

export type Option = {
   value: string
   label: string
   hint?: string | undefined
   group?: string | undefined
}

type Props = {
   options: Option[]
   value: string
   onChange: (value: string) => void
   placeholder: string
   label: string
   className?: string
}

type ListProps = {
   options: Option[]
   value: string
   onPick: (value: string) => void
}

// The searchable list on its own, for the many accounts of an agency; the name, the hint (the client) and the group all match.
export const OptionList = ({ options, value, onPick }: ListProps) => {
   const [query, setQuery] = useState('')
   const needle = query.trim().toLowerCase()
   // Matched here, not by the list, so an id in a value never matches what was typed.
   const shown = options.filter(
      option => needle === '' || `${option.label} ${option.hint ?? ''}`.toLowerCase().includes(needle)
   )
   const groups = [...new Set(shown.map(({ group }) => group ?? ''))]

   return (
      <Command shouldFilter={false}>
         <CommandInput placeholder="Search" value={query} onValueChange={setQuery} />
         <CommandList>
            <CommandEmpty>Nothing found.</CommandEmpty>
            {groups.map(group => (
               <CommandGroup key={group} {...(group ? { heading: group } : {})}>
                  {shown
                     .filter(option => (option.group ?? '') === group)
                     .map(option => (
                        <CommandItem key={option.value} value={option.value} onSelect={() => onPick(option.value)}>
                           <Check className={cn(option.value === value ? 'opacity-100' : 'opacity-0')} aria-hidden />
                           <span className="truncate">{option.label}</span>
                           {option.hint ? (
                              <span className="text-muted-foreground ml-auto truncate text-xs">{option.hint}</span>
                           ) : null}
                        </CommandItem>
                     ))}
               </CommandGroup>
            ))}
         </CommandList>
      </Command>
   )
}

// A button that opens the list to pick one from.
export const Combobox = ({ options, value, onChange, placeholder, label, className }: Props) => {
   const [open, setOpen] = useState(false)
   const current = options.find(option => option.value === value)

   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <Button
               type="button"
               variant="outline"
               role="combobox"
               aria-expanded={open}
               aria-label={label}
               className={cn('justify-between font-normal', className)}
            >
               {current ? (
                  <span className="truncate">{current.label}</span>
               ) : (
                  <span className="text-muted-foreground truncate">{placeholder}</span>
               )}
               <ChevronsUpDown className="opacity-50" aria-hidden />
            </Button>
         </PopoverTrigger>
         <PopoverContent align="start" className="w-80 p-0">
            <OptionList
               options={options}
               value={value}
               onPick={next => {
                  onChange(next)
                  setOpen(false)
               }}
            />
         </PopoverContent>
      </Popover>
   )
}
