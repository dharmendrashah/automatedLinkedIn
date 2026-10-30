import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Minus, Plus, X } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

import { type ChipKind, addValues, splitValues, suggestionsFor } from './chip-values'

// Friendlier inputs for block settings: a number with - and +, lists as chips, and choices as chips.

// The most values a list setting keeps (the block schemas allow 50).
const MAX_CHIPS = 50

const PLACEHOLDERS: Record<ChipKind | 'any', string> = {
   any: 'Type and press Enter, or paste a list',
   titles: 'Pick or type a title',
   locations: 'Pick or type a city or country',
   links: 'Paste LinkedIn links',
   domains: 'Paste websites, such as stripe.com',
}

export const Stepper = ({
   id,
   value,
   min,
   max,
   onChange,
}: {
   id: string
   value: number
   min: number
   max: number
   onChange: (next: number) => void
}) => {
   const clamp = (next: number) => Math.min(max, Math.max(min, Number.isFinite(next) ? next : min))

   return (
      <div className="flex w-44 items-center gap-1">
         <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Less"
            disabled={value <= min}
            onClick={() => onChange(clamp(value - 1))}
         >
            <Minus />
         </Button>
         <Input
            id={id}
            type="number"
            inputMode="numeric"
            className="text-center"
            min={min}
            max={max}
            value={value}
            onChange={event => onChange(clamp(Number(event.target.value)))}
         />
         <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="More"
            disabled={value >= max}
            onClick={() => onChange(clamp(value + 1))}
         >
            <Plus />
         </Button>
      </div>
   )
}

// A list setting as chips: type and press Enter (or Add), or paste a whole list; Backspace removes the last. Titles and
// places offer a short built-in list; links and sites that cannot be used are shown and left out.
export const ChipsInput = ({
   id,
   value,
   kind,
   max = MAX_CHIPS,
   onChange,
}: {
   id: string
   value: string[]
   kind?: ChipKind
   max?: number
   onChange: (next: string[]) => void
}) => {
   const [draft, setDraft] = useState('')
   const [focused, setFocused] = useState(false)
   const [refused, setRefused] = useState<string[]>([])
   const full = value.length >= max
   const suggestions = focused && !full ? suggestionsFor(kind, draft, value) : []

   const add = (text: string) => {
      const result = addValues(kind, value, text, max)

      setRefused(result.refused)

      if (result.values.length !== value.length) {
         onChange(result.values)
      }

      setDraft('')
   }

   return (
      <div className="relative grid gap-1">
         <div className="focus-within:ring-ring/50 flex min-h-9 flex-wrap items-center gap-1 rounded-md border px-2 py-1 focus-within:ring-2">
            {value.map(word => (
               <Badge key={word} variant="secondary" className="gap-1">
                  {word}
                  <button
                     type="button"
                     aria-label={`Remove ${word}`}
                     onClick={() => onChange(value.filter(item => item !== word))}
                  >
                     <X className="size-3" />
                  </button>
               </Badge>
            ))}
            <input
               id={id}
               className="min-w-32 flex-1 bg-transparent text-sm outline-none"
               placeholder={full ? `Up to ${max}` : value.length === 0 ? PLACEHOLDERS[kind ?? 'any'] : ''}
               disabled={full}
               value={draft}
               autoComplete="off"
               onChange={event => setDraft(event.target.value)}
               onFocus={() => setFocused(true)}
               onBlur={() => {
                  setFocused(false)

                  if (draft.trim()) add(draft)
               }}
               onPaste={event => {
                  const text = event.clipboardData.getData('text')

                  if (splitValues(text).length > 1) {
                     event.preventDefault()
                     add(`${draft}\n${text}`)
                  }
               }}
               onKeyDown={event => {
                  if ((event.key === 'Enter' || event.key === ',') && draft.trim()) {
                     event.preventDefault()
                     add(draft)
                  } else if (event.key === 'Backspace' && !draft && value.length > 0) {
                     onChange(value.slice(0, -1))
                  }
               }}
            />
            {draft.trim() ? (
               <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7"
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => add(draft)}
               >
                  Add
               </Button>
            ) : null}
         </div>
         {suggestions.length > 0 ? (
            <ul
               className="bg-popover absolute top-full z-50 mt-1 grid w-full gap-0.5 rounded-md border p-1 shadow-md"
               role="listbox"
            >
               {suggestions.map(suggestion => (
                  <li key={suggestion}>
                     <button
                        type="button"
                        className="hover:bg-muted w-full rounded px-2 py-1 text-left text-sm"
                        // Keeps the input focused, so the click lands before the list closes.
                        onMouseDown={event => event.preventDefault()}
                        onClick={() => add(suggestion)}
                     >
                        {suggestion}
                     </button>
                  </li>
               ))}
            </ul>
         ) : null}
         {refused.length > 0 ? (
            <p className="text-destructive text-xs" role="alert">
               Left out, {kind === 'links' ? 'not a LinkedIn link' : 'not a website'}: {refused.join(', ')}
            </p>
         ) : null}
      </div>
   )
}

export const Chips = ({
   id,
   options,
   isOn,
   onToggle,
}: {
   id: string
   options: { value: string; label: string }[]
   isOn: (value: string) => boolean
   onToggle: (value: string) => void
}) => (
   <div id={id} className="flex flex-wrap gap-2">
      {options.map(option => (
         <button
            key={option.value}
            type="button"
            aria-pressed={isOn(option.value)}
            onClick={() => onToggle(option.value)}
            className={cn(
               'rounded-full border px-3 py-1 text-sm transition-colors',
               isOn(option.value) ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'
            )}
         >
            {option.label}
         </button>
      ))}
   </div>
)

const SHOWN_MATCHES = 8

// Many choices from a long list: type to find one, chosen ones show as chips.
export const SearchPick = ({
   id,
   options,
   value,
   max,
   onChange,
}: {
   id: string
   options: { value: string; label: string }[]
   value: string[]
   max: number
   onChange: (next: string[]) => void
}) => {
   const [query, setQuery] = useState('')
   const words = query.trim().toLowerCase()
   const matches = words
      ? options
           .filter(option => !value.includes(option.value) && option.label.toLowerCase().includes(words))
           .slice(0, SHOWN_MATCHES)
      : []
   const labelOf = (code: string) => options.find(option => option.value === code)?.label ?? code
   const full = value.length >= max

   return (
      <div className="grid gap-2">
         {value.length > 0 ? (
            <div className="flex flex-wrap gap-1">
               {value.map(code => (
                  <span
                     key={code}
                     title={labelOf(code)}
                     className="bg-muted flex items-center gap-1 rounded-md px-2 py-0.5 text-xs"
                  >
                     {labelOf(code).split(' > ').at(-1)}
                     <button
                        type="button"
                        aria-label={`Remove ${labelOf(code)}`}
                        onClick={() => onChange(value.filter(item => item !== code))}
                     >
                        <X className="size-3" />
                     </button>
                  </span>
               ))}
            </div>
         ) : null}
         <Input
            id={id}
            value={query}
            disabled={full}
            placeholder={full ? `Up to ${max}` : 'Type to search, such as software'}
            onChange={event => setQuery(event.target.value)}
         />
         {matches.length > 0 ? (
            <ul className="grid gap-1 rounded-md border p-1">
               {matches.map(option => (
                  <li key={option.value}>
                     <button
                        type="button"
                        className="hover:bg-muted w-full rounded px-2 py-1 text-left text-sm"
                        onClick={() => {
                           onChange([...value, option.value])
                           setQuery('')
                        }}
                     >
                        {option.label}
                     </button>
                  </li>
               ))}
            </ul>
         ) : null}
      </div>
   )
}
