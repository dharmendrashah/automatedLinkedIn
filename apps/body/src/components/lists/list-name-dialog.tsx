import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { Label } from '@/components/ui/label'
import { readableError } from '@/lib/trpc-error'
import { Loader2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'

type Props = {
   title: string
   initial: string
   pending: boolean
   error: { message: string } | null
   onSave: (name: string) => void
   onClose: () => void
}

// Asks for a list name; used to create and to rename a list.
const NameForm = ({ title, initial, pending, error, onSave, onClose }: Props) => {
   const [name, setName] = useState(initial)

   const submit = (event: FormEvent) => {
      event.preventDefault()
      onSave(name.trim())
   }

   return (
      <form onSubmit={submit} className="grid gap-6">
         <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>A short name you will recognise, such as "Agency founders, Q4".</DialogDescription>
         </DialogHeader>
         <div className="grid gap-2">
            <Label htmlFor="list-name">Name</Label>
            <Input
               id="list-name"
               maxLength={100}
               value={name}
               autoFocus
               onChange={event => setName(event.target.value)}
            />
         </div>
         {error ? (
            <Alert variant="destructive">
               <AlertDescription>{readableError(error)}</AlertDescription>
            </Alert>
         ) : null}
         <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
               Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || name.trim() === initial || pending}>
               {pending ? <Loader2 className="animate-spin" /> : null}
               Save
            </Button>
         </DialogFooter>
      </form>
   )
}

export const ListNameDialog = ({ open, ...props }: Props & { open: boolean }) => (
   <Dialog open={open} onOpenChange={next => (next ? undefined : props.onClose())}>
      <DialogContent>{open ? <NameForm {...props} /> : null}</DialogContent>
   </Dialog>
)
