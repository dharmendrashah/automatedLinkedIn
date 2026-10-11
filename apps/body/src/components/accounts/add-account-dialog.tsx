import { type SecretKey, type Values, effectiveFlags, missingFrom } from '@/components/accounts/credential-rules'
import { CredentialsFields } from '@/components/accounts/credentials-fields'
import { EmailField } from '@/components/accounts/email-field'
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
import { readableError } from '@/lib/trpc-error'
import { Info, Loader2, Plus } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { trpc } from '../../trpc'

const emptyValues: Values = {
   password: '',
   totpSecret: '',
   session: '',
}

export const AddAccountDialog = () => {
   const utils = trpc.useUtils()
   const [open, setOpen] = useState(false)
   const [email, setEmail] = useState('')
   const [values, setValues] = useState(emptyValues)

   const create = trpc.linkedInAccount.create.useMutation({
      onSuccess: () => {
         setOpen(false)
         void utils.linkedInAccount.list.invalidate()
      },
   })

   const missing = missingFrom(email, effectiveFlags(values))

   const onOpenChange = (next: boolean) => {
      setOpen(next)

      if (!next) {
         setEmail('')
         setValues(emptyValues)
         create.reset()
      }
   }

   const change = (key: SecretKey, value: string) => setValues(current => ({ ...current, [key]: value }))

   const submit = (event: FormEvent) => {
      event.preventDefault()
      create.mutate({
         email: email.trim(),
         password: values.password || undefined,
         totpSecret: values.totpSecret.trim() || undefined,
         session: values.session.trim() || undefined,
      })
   }

   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogTrigger asChild>
            <Button>
               <Plus />
               Add account
            </Button>
         </DialogTrigger>
         <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <form onSubmit={submit} className="grid gap-6">
               <DialogHeader>
                  <DialogTitle>Add a LinkedIn account</DialogTitle>
                  <DialogDescription>
                     Tell us which account this is and how we can sign in to it. Everything is stored encrypted.
                  </DialogDescription>
               </DialogHeader>

               <EmailField id="add-email" value={email} onChange={setEmail} />

               <div className="grid gap-4">
                  <Alert>
                     <Info />
                     <AlertTitle>2. Choose how we sign in for you</AlertTitle>
                     <AlertDescription>
                        One way is enough. You can also fill in both, and we will use whichever works.
                     </AlertDescription>
                  </Alert>

                  <CredentialsFields idPrefix="add" values={values} onChange={change} />
               </div>

               {create.error ? (
                  <Alert variant="destructive">
                     <AlertTitle>We could not save this account</AlertTitle>
                     <AlertDescription>{readableError(create.error)}</AlertDescription>
                  </Alert>
               ) : null}

               <DialogFooter className="items-center sm:justify-between">
                  <p className="text-muted-foreground text-sm">{missing}</p>
                  <div className="flex gap-2">
                     <DialogClose asChild>
                        <Button type="button" variant="outline">
                           Cancel
                        </Button>
                     </DialogClose>
                     <Button type="submit" disabled={Boolean(missing) || create.isPending}>
                        {create.isPending ? <Loader2 className="animate-spin" /> : null}
                        Save account
                     </Button>
                  </div>
               </DialogFooter>
            </form>
         </DialogContent>
      </Dialog>
   )
}
