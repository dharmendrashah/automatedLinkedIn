import { useState } from 'react'

import { type RouterOutputs, trpc } from '../../trpc'
import { LabelBadge } from './label-badge'
import { LABEL_MAX, type LabelKind, cleanLabel } from './labels'

const SUGGESTED = 8

type Known = RouterOutputs['label']['list'][number]

// Labels that start with what was typed come first, then ones that contain it; the most used first in each.
const suggest = (known: Known[], typed: string, chosen: string[], kind?: LabelKind) => {
   const used = (label: Known) => (kind ? label[kind] : label.total)

   return known
      .filter(({ label }) => !chosen.includes(label) && label.includes(typed))
      .sort((a, b) => Number(b.label.startsWith(typed)) - Number(a.label.startsWith(typed)) || used(b) - used(a))
      .slice(0, SUGGESTED)
}

type Props = {
   id: string
   value: string[]
   onChange: (next: string[]) => void
   // Counts shown next to suggestions come from this page; all pages when not set.
   kind?: LabelKind
   placeholder?: string
}

// Labels as chips: type to see the owner's labels, Enter or a comma adds what was typed, Backspace removes the last.
export const LabelPicker = ({ id, value, onChange, kind, placeholder = 'Type a label' }: Props) => {
   const [draft, setDraft] = useState('')
   const [open, setOpen] = useState(false)
   const known = trpc.label.list.useQuery(undefined, {
      staleTime: 30_000,
      enabled: open,
   })
   const full = value.length >= LABEL_MAX
   const typed = cleanLabel(draft)
   const suggestions = open && !full ? suggest(known.data ?? [], typed, value, kind) : []

   const add = (labels: string[]) => {
      const fresh = [...new Set(labels.map(cleanLabel))].filter(label => label && !value.includes(label))

      if (fresh.length > 0) {
         onChange([...value, ...fresh].slice(0, LABEL_MAX))
      }

      setDraft('')
   }

   return (
      <div className="relative">
         <div className="focus-within:ring-ring/50 flex min-h-9 flex-wrap items-center gap-1 rounded-md border px-2 py-1 focus-within:ring-2">
            {value.map(label => (
               <LabelBadge key={label} label={label} onRemove={() => onChange(value.filter(item => item !== label))} />
            ))}
            <input
               id={id}
               className="min-w-24 flex-1 bg-transparent text-sm outline-none"
               placeholder={full ? `Up to ${LABEL_MAX}` : value.length === 0 ? placeholder : ''}
               disabled={full}
               maxLength={200}
               value={draft}
               autoComplete="off"
               onChange={event => setDraft(event.target.value)}
               onFocus={() => setOpen(true)}
               onBlur={() => {
                  setOpen(false)
                  add(draft.split(','))
               }}
               onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ',') {
                     event.preventDefault()
                     add(draft.split(','))
                  } else if (event.key === 'Backspace' && !draft && value.length > 0) {
                     onChange(value.slice(0, -1))
                  } else if (event.key === 'Escape') {
                     setOpen(false)
                  }
               }}
            />
         </div>
         {suggestions.length > 0 ? (
            <ul className="bg-popover absolute z-50 mt-1 grid w-full gap-0.5 rounded-md border p-1 shadow-md" role="listbox">
               {suggestions.map(label => (
                  <li key={label.label}>
                     <button
                        type="button"
                        className="hover:bg-muted flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-sm"
                        // Keeps the input focused, so the click lands before the list closes.
                        onMouseDown={event => event.preventDefault()}
                        onClick={() => add([label.label])}
                     >
                        <LabelBadge label={label.label} />
                        <span className="text-muted-foreground text-xs tabular-nums">{kind ? label[kind] : label.total}</span>
                     </button>
                  </li>
               ))}
            </ul>
         ) : null}
      </div>
   )
}
