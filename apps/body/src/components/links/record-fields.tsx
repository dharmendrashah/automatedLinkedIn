import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import { LabelPicker } from '../labels/label-picker'
import { type LabelKind } from '../labels/labels'
import { toTagList } from './form-rules'
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

export const TagsField = ({ id, value, onChange, kind }: FieldProps & { kind: LabelKind }) => (
   <div className="grid gap-2">
      <Label htmlFor={id}>Labels</Label>
      <LabelPicker id={id} kind={kind} value={toTagList(value)} onChange={labels => onChange(labels.join(', '))} />
      <p className="text-muted-foreground text-xs">Up to 20, 30 characters each. A prefix such as acme: keeps a client's labels together.</p>
   </div>
)

export const NotesField = ({ id, value, onChange }: FieldProps) => (
   <div className="grid gap-2">
      <Label htmlFor={id}>Notes</Label>
      <Textarea id={id} rows={4} maxLength={5000} value={value} onChange={event => onChange(event.target.value)} />
   </div>
)
