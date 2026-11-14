import { Input } from '@/components/ui/input'
import { type ChipKind, addValues } from '@/components/workflows/chip-values'
import { Chips } from '@/components/workflows/setting-inputs'
import { useState } from 'react'

// Many choices as toggle buttons. A value the user adds joins the list as a picked button, so nothing needs a dropdown.
export const ChoiceButtons = ({
   id,
   options,
   value,
   kind,
   ownLabel,
   max = 20,
   onChange,
}: {
   id: string
   options: readonly string[]
   value: string[]
   kind: ChipKind
   ownLabel: string
   max?: number
   onChange: (next: string[]) => void
}) => {
   const [draft, setDraft] = useState('')
   const full = value.length >= max
   const shown = [...options, ...value.filter(each => !options.includes(each))]

   const toggle = (each: string) => {
      if (value.includes(each)) {
         onChange(value.filter(item => item !== each))
      } else if (!full) {
         onChange([...value, each])
      }
   }
   const add = () => {
      if (draft.trim() !== '') {
         onChange(addValues(kind, value, draft, max).values)
         setDraft('')
      }
   }

   return (
      <div className="grid gap-2">
         <Chips
            id={id}
            options={shown.map(each => ({ value: each, label: each }))}
            isOn={each => value.includes(each)}
            onToggle={toggle}
         />
         <Input
            aria-label={ownLabel}
            className="max-w-xs"
            placeholder={`${ownLabel}, then Enter`}
            disabled={full}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
               if (event.key === 'Enter') {
                  event.preventDefault()
                  add()
               }
            }}
         />
         {full ? <p className="text-muted-foreground text-xs">{`Up to ${max}.`}</p> : null}
      </div>
   )
}
