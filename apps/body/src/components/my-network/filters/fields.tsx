import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Check, ChevronDown, X } from 'lucide-react'
import { type ReactNode, useId, useState } from 'react'

import { cn } from '@/lib/utils'

import { type DateRange, QUICK_RANGES } from './model'

export type Option = { value: string; label: string; icon?: ReactNode; hint?: string }

export const Field = ({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) => (
   <div className="grid gap-1.5">
      <Label htmlFor={htmlFor} className="text-muted-foreground text-xs font-medium">
         {label}
      </Label>
      {children}
   </div>
)

export const TextField = ({
   label,
   value,
   placeholder,
   onChange,
}: {
   label: string
   value: string | undefined
   placeholder: string
   onChange: (value: string | undefined) => void
}) => {
   const id = useId()

   return (
      <Field label={label} htmlFor={id}>
         <Input
            id={id}
            value={value ?? ''}
            placeholder={placeholder}
            onChange={event => onChange(event.target.value || undefined)}
         />
      </Field>
   )
}

// Several values from a list the owner can search, shown as removable tags under the button.
export const MultiPick = ({
   label,
   placeholder,
   options,
   value,
   onChange,
}: {
   label: string
   placeholder: string
   options: Option[]
   value: string[]
   onChange: (value: string[]) => void
}) => {
   const toggle = (option: string) =>
      onChange(value.includes(option) ? value.filter(item => item !== option) : [...value, option])
   const picked = options.filter(option => value.includes(option.value))

   return (
      <Field label={label}>
         <Popover>
            <PopoverTrigger asChild>
               <Button variant="outline" className="justify-between font-normal">
                  <span className={cn('truncate', picked.length === 0 && 'text-muted-foreground')}>
                     {picked.length === 0 ? placeholder : `${picked.length} chosen`}
                  </span>
                  <ChevronDown className="opacity-50" />
               </Button>
            </PopoverTrigger>
            <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
               <Command>
                  <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />
                  <CommandList>
                     <CommandEmpty>Nothing found.</CommandEmpty>
                     <CommandGroup>
                        {options.map(option => (
                           <CommandItem key={option.value} value={option.label} onSelect={() => toggle(option.value)}>
                              <span
                                 className={cn(
                                    'grid size-4 place-items-center rounded-sm border',
                                    value.includes(option.value) && 'bg-primary border-primary text-primary-foreground'
                                 )}
                              >
                                 {value.includes(option.value) ? <Check className="size-3 text-current" /> : null}
                              </span>
                              {option.icon}
                              <span className="truncate">{option.label}</span>
                              {option.hint ? (
                                 <span className="text-muted-foreground ml-auto text-xs">{option.hint}</span>
                              ) : null}
                           </CommandItem>
                        ))}
                     </CommandGroup>
                  </CommandList>
               </Command>
            </PopoverContent>
         </Popover>
         {picked.length > 0 ? (
            <div className="flex flex-wrap gap-1">
               {picked.map(option => (
                  <span
                     key={option.value}
                     className="bg-secondary inline-flex items-center gap-1 rounded-md py-0.5 pr-1 pl-2 text-xs"
                  >
                     {option.icon}
                     {option.label}
                     <button
                        type="button"
                        className="hover:bg-background rounded-sm p-0.5"
                        aria-label={`Remove ${option.label}`}
                        onClick={() => toggle(option.value)}
                     >
                        <X className="size-3" />
                     </button>
                  </span>
               ))}
            </div>
         ) : null}
      </Field>
   )
}

// One of a few answers, or none (click the chosen one again to clear it).
export const Choice = <V extends string>({
   label,
   options,
   value,
   onChange,
}: {
   label: string
   options: Array<[V, string]>
   value: V | undefined
   onChange: (value: V | undefined) => void
}) => (
   <Field label={label}>
      <ToggleGroup
         type="single"
         variant="outline"
         size="sm"
         value={value ?? ''}
         onValueChange={next => onChange(options.find(([option]) => option === next)?.[0])}
      >
         {options.map(([option, word]) => (
            <ToggleGroupItem key={option} value={option}>
               {word}
            </ToggleGroupItem>
         ))}
      </ToggleGroup>
   </Field>
)

// A from and a to day, either may stay empty, with quick choices above.
export const DateRangeField = ({
   label,
   value,
   disabled = false,
   onChange,
}: {
   label: string
   value: DateRange
   disabled?: boolean
   onChange: (value: DateRange) => void
}) => {
   const id = useId()
   const [now] = useState(() => new Date())

   return (
      <Field label={label} htmlFor={`${id}-from`}>
         <div className="flex flex-wrap gap-1">
            {QUICK_RANGES.map(([word, range]) => {
               const quick = range(now)
               const on = quick.from === value.from && quick.to === value.to

               return (
                  <Button
                     key={word}
                     type="button"
                     variant={on ? 'secondary' : 'ghost'}
                     size="sm"
                     className="h-7 px-2 text-xs"
                     disabled={disabled}
                     aria-pressed={on}
                     onClick={() => onChange(on ? {} : quick)}
                  >
                     {word}
                  </Button>
               )
            })}
         </div>
         <div className="flex items-center gap-2">
            <Input
               id={`${id}-from`}
               type="date"
               aria-label={`${label} from`}
               value={value.from ?? ''}
               max={value.to}
               disabled={disabled}
               onChange={event => onChange({ ...value, from: event.target.value || undefined })}
            />
            <span className="text-muted-foreground text-xs">to</span>
            <Input
               type="date"
               aria-label={`${label} to`}
               value={value.to ?? ''}
               min={value.from}
               disabled={disabled}
               onChange={event => onChange({ ...value, to: event.target.value || undefined })}
            />
         </div>
      </Field>
   )
}
