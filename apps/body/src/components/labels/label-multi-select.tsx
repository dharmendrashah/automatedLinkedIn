import { Badge } from '@/components/ui/badge'
import {
   Command,
   CommandEmpty,
   CommandGroup,
   CommandInput,
   CommandItem,
   CommandList,
   CommandSeparator,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CheckIcon, ChevronsUpDown, Plus } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

import { trpc } from '../../trpc'
import { LabelBadge } from './label-badge'
import { LABEL_MAX, type LabelKind, cleanLabel, toneOf } from './labels'

type Options = {
   value: string[]
   onChange: (next: string[]) => void
   // Counts next to each label come from this page; all pages when not set.
   kind?: LabelKind
}

// Every label the owner has, to tick or untick, plus "Create" for a new one. Starts-with matches come first.
export const LabelOptions = ({ value, onChange, kind }: Options) => {
   const [search, setSearch] = useState('')
   // Read again each time the picker opens, so a label just made on another row or page is there.
   const known = trpc.label.list.useQuery(undefined, { refetchOnMount: 'always' })
   const typed = cleanLabel(search)
   const counts = new Map((known.data ?? []).map(label => [label.label, kind ? label[kind] : label.total]))
   const all = [...new Set([...value, ...counts.keys()])]
   const shown = all
      .filter(label => label.includes(typed))
      .sort(
         (a, b) =>
            Number(b.startsWith(typed)) - Number(a.startsWith(typed)) || (counts.get(b) ?? 0) - (counts.get(a) ?? 0)
      )
   const full = value.length >= LABEL_MAX
   const toggle = (label: string) =>
      onChange(value.includes(label) ? value.filter(item => item !== label) : [...value, label].slice(0, LABEL_MAX))

   return (
      <Command shouldFilter={false}>
         <CommandInput placeholder="Find or create a label" value={search} onValueChange={setSearch} maxLength={60} />
         <CommandList>
            <CommandEmpty>{known.isPending ? 'Loading labels…' : 'No labels yet. Type one to create it.'}</CommandEmpty>
            {typed && !all.includes(typed) ? (
               <CommandGroup>
                  <CommandItem
                     value={`create:${typed}`}
                     disabled={full}
                     onSelect={() => {
                        toggle(typed)
                        setSearch('')
                     }}
                  >
                     <Plus />
                     Create <LabelBadge label={typed} />
                  </CommandItem>
               </CommandGroup>
            ) : null}
            {shown.length > 0 ? (
               <CommandGroup heading={full ? `Up to ${LABEL_MAX} labels` : 'Labels'}>
                  {shown.map(label => {
                     const on = value.includes(label)

                     return (
                        <CommandItem key={label} value={label} disabled={full && !on} onSelect={() => toggle(label)}>
                           <span
                              className={cn(
                                 'grid size-4 place-items-center rounded-sm border',
                                 on ? 'bg-primary border-primary text-primary-foreground' : 'border-input'
                              )}
                           >
                              {on ? <CheckIcon className="text-primary-foreground size-3" /> : null}
                           </span>
                           <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', toneOf(label))}>
                              {label}
                           </span>
                           <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                              {counts.get(label) ?? 0}
                           </span>
                        </CommandItem>
                     )
                  })}
               </CommandGroup>
            ) : null}
            {value.length > 0 ? (
               <>
                  <CommandSeparator />
                  <CommandGroup>
                     <CommandItem value="clear" className="justify-center" onSelect={() => onChange([])}>
                        Clear {value.length === 1 ? 'the label' : `all ${value.length}`}
                     </CommandItem>
                  </CommandGroup>
               </>
            ) : null}
         </CommandList>
      </Command>
   )
}

const SHOWN_CHOSEN = 3

// A form field: the chosen labels as badges, opening the list of every label.
export const LabelMultiSelect = ({
   id,
   value,
   onChange,
   kind,
   placeholder = 'Pick labels',
   className,
}: Options & { id?: string; placeholder?: string; className?: string }) => (
   <Popover>
      <PopoverTrigger asChild>
         <button
            id={id}
            type="button"
            className={cn(
               'border-input focus-visible:ring-ring/50 flex min-h-9 w-full items-center gap-1 rounded-md border px-2 py-1 text-left text-sm shadow-xs outline-none focus-visible:ring-2',
               className
            )}
         >
            {value.length === 0 ? <span className="text-muted-foreground">{placeholder}</span> : null}
            <span className="flex min-w-0 flex-1 flex-wrap gap-1">
               {value.slice(0, SHOWN_CHOSEN).map(label => (
                  <LabelBadge key={label} label={label} />
               ))}
               {value.length > SHOWN_CHOSEN ? <Badge variant="secondary">+{value.length - SHOWN_CHOSEN}</Badge> : null}
            </span>
            <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" aria-hidden />
         </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
         <LabelOptions value={value} onChange={onChange} kind={kind} />
      </PopoverContent>
   </Popover>
)
