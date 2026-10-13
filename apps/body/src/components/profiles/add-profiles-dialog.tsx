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

import { trpc } from '../../trpc'

export const AddProfilesDialog = () => {
   const utils = trpc.useUtils()
   const [open, setOpen] = useState(false)
   const [urls, setUrls] = useState('')

   const create = trpc.linkedInProfile.create.useMutation({
      onSuccess: () => {
         setUrls('')
         void utils.linkedInProfile.list.invalidate()
      },
   })

   const onOpenChange = (next: boolean) => {
      setOpen(next)

      if (!next) {
         setUrls('')
         create.reset()
      }
   }

   const submit = (event: FormEvent) => {
      event.preventDefault()
      create.mutate({ urls })
   }

   const result = create.data

   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogTrigger asChild>
            <Button>
               <Plus />
               Add profiles
            </Button>
         </DialogTrigger>
         <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <form onSubmit={submit} className="grid gap-6">
               <DialogHeader>
                  <DialogTitle>Add LinkedIn profiles</DialogTitle>
                  <DialogDescription>
                     Paste the links of the people you want to keep track of. Only the link is saved. You can add their
                     details yourself afterwards.
                  </DialogDescription>
               </DialogHeader>

               <div className="grid gap-2">
                  <Label htmlFor="profile-urls">Profile links</Label>
                  <Textarea
                     id="profile-urls"
                     rows={6}
                     placeholder="https://www.linkedin.com/in/ada-lovelace"
                     value={urls}
                     onChange={event => setUrls(event.target.value)}
                     aria-describedby="profile-urls-hint"
                  />
                  <p id="profile-urls-hint" className="text-muted-foreground text-xs">
                     One link per line, up to 200. Only links that look like linkedin.com/in/name are accepted.
                  </p>
               </div>

               {result ? (
                  <Alert role="status">
                     <AlertTitle>
                        Added {result.created}, restored {result.restored}, already in your list {result.skipped}
                     </AlertTitle>
                     {result.invalid.length > 0 ? (
                        <AlertDescription>
                           <p>These are not LinkedIn profile links and were left out:</p>
                           <ul className="list-disc pl-5 break-all">
                              {result.invalid.map(entry => (
                                 <li key={entry}>{entry}</li>
                              ))}
                           </ul>
                        </AlertDescription>
                     ) : null}
                  </Alert>
               ) : null}

               {create.error ? (
                  <Alert variant="destructive">
                     <AlertTitle>We could not save these links</AlertTitle>
                     <AlertDescription>{readableError(create.error)}</AlertDescription>
                  </Alert>
               ) : null}

               <DialogFooter>
                  <DialogClose asChild>
                     <Button type="button" variant="outline">
                        {result ? 'Done' : 'Cancel'}
                     </Button>
                  </DialogClose>
                  <Button type="submit" disabled={!urls.trim() || create.isPending}>
                     {create.isPending ? <Loader2 className="animate-spin" /> : null}
                     Save profiles
                  </Button>
               </DialogFooter>
            </form>
         </DialogContent>
      </Dialog>
   )
}
