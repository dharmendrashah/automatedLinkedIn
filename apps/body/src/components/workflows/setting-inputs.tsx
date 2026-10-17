import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Minus, Plus, X } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

// Friendlier inputs for block settings: a number with - and +, words as chips, and choices as chips.

export const Stepper = ({ id, value, min, max, onChange }: { id: string; value: number; min: number; max: number; onChange: (next: number) => void }) => {
   const clamp = (next: number) => Math.min(max, Math.max(min, Number.isFinite(next) ? next : min))

   return (
      <div className="flex w-44 items-center gap-1">
         <Button type="button" variant="outline" size="icon" aria-label="Less" disabled={value <= min} onClick={() => onChange(clamp(value - 1))}>
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
         <Button type="button" variant="outline" size="icon" aria-label="More" disabled={value >= max} onClick={() => onChange(clamp(value + 1))}>
            <Plus />
         </Button>
      </div>
   )
}

// Words as chips: Enter or a comma adds one, Backspace on an empty box removes the last.
export const TagInput = ({ id, value, onChange }: { id: string; value: string[]; onChange: (next: string[]) => void }) => {
   const [draft, setDraft] = useState('')
   const add = () => {
      const words = draft
         .split(',')
         .map(word => word.trim())
         .filter(word => word && !value.includes(word))

      if (words.length > 0) {
         onChange([...value, ...words])
      }

      setDraft('')
   }

   return (
      <div className="focus-within:ring-ring/50 flex min-h-9 flex-wrap items-center gap-1 rounded-md border px-2 py-1 focus-within:ring-2">
         {value.map(word => (
            <span key={word} className="bg-muted flex items-center gap-1 rounded-md px-2 py-0.5 text-xs">
               {word}
               <button type="button" aria-label={`Remove ${word}`} onClick={() => onChange(value.filter(item => item !== word))}>
                  <X className="size-3" />
               </button>
            </span>
         ))}
         <input
            id={id}
            className="min-w-24 flex-1 bg-transparent text-sm outline-none"
            placeholder={value.length === 0 ? 'Type and press Enter' : ''}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onBlur={add}
            onKeyDown={event => {
               if (event.key === 'Enter' || event.key === ',') {
                  event.preventDefault()
                  add()
               } else if (event.key === 'Backspace' && !draft && value.length > 0) {
                  onChange(value.slice(0, -1))
               }
            }}
         />
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

