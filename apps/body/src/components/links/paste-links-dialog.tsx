import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
   Dialog,
   DialogClose,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
   DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { readableError } from '@/lib/trpc-error'
import { Loader2, Plus } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { LabelMultiSelect } from '../labels/label-multi-select'
import { type LabelKind } from '../labels/labels'

export type PasteMutation = {
   mutate: (input: { urls: string; labels: string[] }, options?: { onSuccess?: () => void }) => void
   reset: () => void
   isPending: boolean
   error: { message: string } | null
   data: { created: number; restored: number; skipped: number; invalid: string[] } | undefined
}

type Props = {
   mutation: PasteMutation
   kind: LabelKind
   triggerLabel: string
   title: string
   description: string
   linksLabel: string
   placeholder: string
   hint: string
   // What was left out, such as "LinkedIn profile links".
   invalidNote: string
}

// Asks for pasted links and shows what was added, restored, skipped and left out.
export const PasteLinksDialog = ({
   mutation,
   kind,
   triggerLabel,
   title,
   description,
   linksLabel,
   placeholder,
   hint,
   invalidNote,
}: Props) => {
   const [open, setOpen] = useState(false)
   const [urls, setUrls] = useState('')
   const [labels, setLabels] = useState<string[]>([])

   const onOpenChange = (next: boolean) => {
      setOpen(next)

      if (!next) {
         setUrls('')
         setLabels([])
         mutation.reset()
      }
   }

   const submit = (event: FormEvent) => {
      event.preventDefault()
      mutation.mutate(
         {
            urls,
            labels,
         },
         { onSuccess: () => setUrls('') }
      )
   }

   const result = mutation.data

   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogTrigger asChild>
            <Button>
               <Plus />
               {triggerLabel}
            </Button>
         </DialogTrigger>
         <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <form onSubmit={submit} className="grid gap-6">
               <DialogHeader>
                  <DialogTitle>{title}</DialogTitle>
                  <DialogDescription>{description}</DialogDescription>
               </DialogHeader>

               <div className="grid gap-2">
                  <Label htmlFor="pasted-links">{linksLabel}</Label>
                  <Textarea
                     id="pasted-links"
                     rows={6}
                     placeholder={placeholder}
                     value={urls}
                     onChange={event => setUrls(event.target.value)}
                     aria-describedby="pasted-links-hint"
                  />
                  <p id="pasted-links-hint" className="text-muted-foreground text-xs">
                     {hint}
                  </p>
               </div>

               <div className="grid gap-2">
                  <Label htmlFor="pasted-labels">Labels for everything you add (optional)</Label>
                  <LabelMultiSelect id="pasted-labels" kind={kind} value={labels} onChange={setLabels} placeholder="Pick or create labels" />
                  <p className="text-muted-foreground text-xs">Links you already have get these labels added to theirs.</p>
               </div>

               {result ? (
                  <Alert role="status">
                     <AlertTitle>
                        Added {result.created}, restored {result.restored}, already in your list {result.skipped}
                     </AlertTitle>
                     {result.invalid.length > 0 ? (
                        <AlertDescription>
                           <p>These are not {invalidNote} and were left out:</p>
                           <ul className="list-disc pl-5 break-all">
                              {result.invalid.map(entry => (
                                 <li key={entry}>{entry}</li>
                              ))}
                           </ul>
                        </AlertDescription>
                     ) : null}
                  </Alert>
               ) : null}

               {mutation.error ? (
                  <Alert variant="destructive">
                     <AlertTitle>We could not save these links</AlertTitle>
                     <AlertDescription>{readableError(mutation.error)}</AlertDescription>
                  </Alert>
               ) : null}

               <DialogFooter>
                  <DialogClose asChild>
                     <Button type="button" variant="outline">
                        {result ? 'Done' : 'Cancel'}
                     </Button>
                  </DialogClose>
                  <Button type="submit" disabled={!urls.trim() || mutation.isPending}>
                     {mutation.isPending ? <Loader2 className="animate-spin" /> : null}
                     Save
                  </Button>
               </DialogFooter>
            </form>
         </DialogContent>
      </Dialog>
   )
}
