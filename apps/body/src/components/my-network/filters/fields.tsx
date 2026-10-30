import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Check, ChevronDown, X } from 'lucide-react'
import { type ReactNode, useId } from 'react'

import { cn } from '@/lib/utils'

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

// Yes, no, or either (nothing chosen).
export const YesNo = ({
   label,
   yes,
   no,
   value,
   onChange,
}: {
   label: string
   yes: string
   no: string
   value: boolean | undefined
   onChange: (value: boolean | undefined) => void
}) => (
   <Choice
      label={label}
      options={[
         ['yes', yes],
         ['no', no],
      ]}
      value={value === undefined ? undefined : value ? 'yes' : 'no'}
      onChange={next => onChange(next === undefined ? undefined : next === 'yes')}
   />
)
