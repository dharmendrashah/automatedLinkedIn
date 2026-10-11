import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Props = {
   id: string
   value: string
   onChange: (value: string) => void
}

export const EmailField = ({ id, value, onChange }: Props) => (
   <div className="grid gap-2">
      <Label htmlFor={id}>1. Your LinkedIn email</Label>
      <Input
         id={id}
         type="email"
         autoComplete="off"
         placeholder="you@example.com"
         value={value}
         onChange={event => onChange(event.target.value)}
         aria-describedby={`${id}-hint`}
         required
      />
      <p id={`${id}-hint`} className="text-muted-foreground text-xs">
         The email you use to sign in to LinkedIn.
      </p>
   </div>
)
