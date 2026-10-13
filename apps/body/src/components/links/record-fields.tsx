import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import { type LinkStatus } from './types'

import { isLinkStatus, linkStatuses } from './link-statuses'

type FieldProps = {
   id: string
   value: string
   onChange: (value: string) => void
}

export const TextField = ({
   id,
   label,
   maxLength,
   value,
   onChange,
}: FieldProps & { label: string; maxLength: number }) => (
   <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} maxLength={maxLength} onChange={event => onChange(event.target.value)} />
   </div>
)

export const StatusField = ({
   id,
   value,
   onChange,
}: {
   id: string
   value: LinkStatus
   onChange: (value: LinkStatus) => void
}) => (
   <div className="grid gap-2">
      <Label htmlFor={id}>Status</Label>
      <Select value={value} onValueChange={next => (isLinkStatus(next) ? onChange(next) : undefined)}>
         <SelectTrigger id={id}>
            <SelectValue />
         </SelectTrigger>
         <SelectContent>
            {Object.entries(linkStatuses).map(([status, { label }]) => (
               <SelectItem key={status} value={status}>
                  {label}
               </SelectItem>
            ))}
         </SelectContent>
      </Select>
   </div>
)

export const TagsField = ({ id, value, onChange }: FieldProps) => (
   <div className="grid gap-2">
      <Label htmlFor={id}>Tags</Label>
      <Input
         id={id}
         placeholder="vip, conference"
         value={value}
         onChange={event => onChange(event.target.value)}
         aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className="text-muted-foreground text-xs">
         Separate with commas. Up to 10, 30 characters each.
      </p>
   </div>
)

export const NotesField = ({ id, value, onChange }: FieldProps) => (
   <div className="grid gap-2">
      <Label htmlFor={id}>Notes</Label>
      <Textarea id={id} rows={4} maxLength={5000} value={value} onChange={event => onChange(event.target.value)} />
   </div>
)
