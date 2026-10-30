import { Button } from '@/components/ui/button'
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { type FormEvent, useState } from 'react'

type Props = {
   open: boolean
   onOpenChange: (open: boolean) => void
   title: string
   description: string
   label: string
   initial?: string
   maxLength: number
   action: string
   busy: boolean
   error: string | null
   onSave: (name: string) => void
}

type FormProps = Omit<Props, 'open'>

const NameForm = ({
   onOpenChange,
   title,
   description,
   label,
   initial = '',
   maxLength,
   action,
   busy,
   error,
   onSave,
}: FormProps) => {
   const [name, setName] = useState(initial)
   const ready = name.trim() !== '' && name.trim() !== initial

   const submit = (event: FormEvent) => {
      event.preventDefault()

      if (ready) {
         onSave(name.trim())
      }
   }

   return (
      <form onSubmit={submit} className="grid gap-4">
         <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
         </DialogHeader>
         <Input
            value={name}
            onChange={event => setName(event.target.value)}
            aria-label={label}
            placeholder={label}
            maxLength={maxLength}
            autoFocus
         />
         {error ? (
            <p className="text-destructive text-sm" role="alert">
               {error}
            </p>
         ) : null}
         <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
               Cancel
            </Button>
            <Button type="submit" disabled={!ready || busy}>
               {action}
            </Button>
         </DialogFooter>
      </form>
   )
}

// One name to type, for a new or renamed client or list. The form mounts per opening, so it starts from `initial`.
export const NameDialog = ({ open, ...props }: Props) => (
   <Dialog open={open} onOpenChange={props.onOpenChange}>
      <DialogContent>
         <NameForm {...props} />
      </DialogContent>
   </Dialog>
)
