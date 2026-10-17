import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useState } from 'react'

// Notes that save when the field loses focus and the text changed.
export const NotesField = ({
   id,
   value,
   placeholder,
   onSave,
}: {
   id: string
   value: string | null
   placeholder: string
   onSave: (next: string) => void
}) => {
   const [draft, setDraft] = useState(value ?? '')

   return (
      <div className="grid gap-1.5">
         <Label htmlFor={id}>Notes</Label>
         <Textarea
            id={id}
            rows={3}
            maxLength={2_000}
            placeholder={placeholder}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onBlur={() => (draft !== (value ?? '') ? onSave(draft) : undefined)}
         />
      </div>
   )
}
