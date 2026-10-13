import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog'
import { readableError } from '@/lib/trpc-error'
import { Loader2 } from 'lucide-react'
import { type FormEvent, type ReactNode } from 'react'

type DialogProps = {
   open: boolean
   onClose: () => void
   children: ReactNode
}

export const EditDialog = ({ open, onClose, children }: DialogProps) => (
   <Dialog open={open} onOpenChange={next => (next ? undefined : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">{children}</DialogContent>
   </Dialog>
)

type FrameProps = {
   title: string
   description: string
   changed: boolean
   pending: boolean
   error: { message: string } | null
   onSubmit: () => void
   onClose: () => void
   children: ReactNode
}

// The header, error and buttons around the fields of an edit form.
export const EditFrame = ({ title, description, changed, pending, error, onSubmit, onClose, children }: FrameProps) => {
   const submit = (event: FormEvent) => {
      event.preventDefault()
      onSubmit()
   }

   return (
      <form onSubmit={submit} className="grid gap-6">
         <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
         </DialogHeader>

         {children}

         {error ? (
            <Alert variant="destructive">
               <AlertTitle>We could not save your changes</AlertTitle>
               <AlertDescription>{readableError(error)}</AlertDescription>
            </Alert>
         ) : null}

         <DialogFooter className="items-center sm:justify-between">
            <p className="text-muted-foreground text-sm">{changed ? '' : 'No changes yet.'}</p>
            <div className="flex gap-2">
               <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
               </Button>
               <Button type="submit" disabled={!changed || pending}>
                  {pending ? <Loader2 className="animate-spin" /> : null}
                  Save changes
               </Button>
            </div>
         </DialogFooter>
      </form>
   )
}
