import { cleanLabel } from '@/components/labels/labels'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Ban, Tag, UserPlus, X } from 'lucide-react'
import { useState } from 'react'

import { type PersonStatus, STATUSES, isStatus } from './words'

export type BulkChange = { status?: PersonStatus; labels?: string[]; doNotContact?: boolean }

type Props = {
   count: number
   busy: boolean
   onChange: (change: BulkChange) => void
   // Shown once invites are live.
   onInvite?: () => void
   onClear: () => void
}

// What can be done to the chosen people of this page at once: invite, status, a label, Do not contact.
export const BulkBar = ({ count, busy, onChange, onInvite, onClear }: Props) => {
   const [label, setLabel] = useState('')
   const cleaned = cleanLabel(label)

   return (
      <div
         className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm"
         role="region"
         aria-label="Chosen people"
      >
         <span className="font-medium">{`${count} chosen`}</span>
         {onInvite ? (
            <Button size="sm" disabled={busy} onClick={onInvite}>
               <UserPlus />
               Invite
            </Button>
         ) : null}
         <Select
            value=""
            disabled={busy}
            onValueChange={value => (isStatus(value) ? onChange({ status: value }) : undefined)}
         >
            <SelectTrigger size="sm" className="w-40" aria-label="Set the status">
               <SelectValue placeholder="Set status" />
            </SelectTrigger>
            <SelectContent>
               {STATUSES.map(([status, word]) => (
                  <SelectItem key={status} value={status}>
                     {word}
                  </SelectItem>
               ))}
            </SelectContent>
         </Select>
         <form
            className="flex items-center gap-1"
            onSubmit={event => {
               event.preventDefault()

               if (cleaned) {
                  onChange({ labels: [cleaned] })
                  setLabel('')
               }
            }}
         >
            <Input
               value={label}
               onChange={event => setLabel(event.target.value)}
               placeholder="Label"
               aria-label="Label to add"
               className="h-8 w-32"
            />
            <Button type="submit" variant="outline" size="sm" disabled={busy || !cleaned}>
               <Tag />
               Add label
            </Button>
         </form>
         <Button variant="outline" size="sm" disabled={busy} onClick={() => onChange({ doNotContact: true })}>
            <Ban />
            Do not contact
         </Button>
         <Button variant="ghost" size="sm" className="ml-auto" onClick={onClear}>
            <X />
            Clear
         </Button>
      </div>
   )
}
