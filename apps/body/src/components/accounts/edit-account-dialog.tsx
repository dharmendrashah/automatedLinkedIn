import {
   type Flags,
   type SecretKey,
   type Values,
   buildPatch,
   effectiveFlags,
   hasChanges,
   missingFrom,
   noFlags,
} from '@/components/accounts/credential-rules'
import { CredentialsFields } from '@/components/accounts/credentials-fields'
import { EmailField } from '@/components/accounts/email-field'
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
import { Info, Loader2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { type Account } from '@/components/accounts/types'

import { trpc } from '../../trpc'

const emptyValues: Values = {
   password: '',
   totpSecret: '',
   session: '',
}

type FormProps = {
   account: Account
   onClose: () => void
}

const EditForm = ({ account, onClose }: FormProps) => {
   const utils = trpc.useUtils()
   const [email, setEmail] = useState(account.email)
   const [values, setValues] = useState(emptyValues)
   const [cleared, setCleared] = useState<Flags>(noFlags)

   const saved: Flags = {
      password: account.hasPassword,
      totpSecret: account.hasTotp,
      session: account.hasSession,
   }

   const update = trpc.linkedInAccount.update.useMutation({
      onSuccess: () => {
         onClose()
         void utils.linkedInAccount.list.invalidate()
      },
   })

   const patch = buildPatch(values, cleared)
   const changed = hasChanges(email, account.email, patch)
   const missing =
      missingFrom(email, effectiveFlags(values, saved, cleared)) ?? (changed ? undefined : 'No changes yet.')

   const change = (key: SecretKey, value: string) => setValues(current => ({ ...current, [key]: value }))

   // The two-step key only works with the password, so removing the password removes the key too.
   const remove = (key: SecretKey) =>
      setCleared(current => ({
         ...current,
         [key]: true,
         ...(key === 'password' && saved.totpSecret ? { totpSecret: true } : {}),
      }))

   const undo = (key: SecretKey) => setCleared(current => ({ ...current, [key]: false }))

   const submit = (event: FormEvent) => {
      event.preventDefault()
      update.mutate({
         id: account.id,
         email: email.trim() === account.email ? undefined : email.trim(),
         ...patch,
      })
   }

   return (
      <form onSubmit={submit} className="grid gap-6">
         <DialogHeader>
            <DialogTitle>Edit {account.email}</DialogTitle>
            <DialogDescription>
               Change any sign-in method, or both. Saved values are hidden: leave a field blank to keep it.
            </DialogDescription>
         </DialogHeader>

         <EmailField id="edit-email" value={email} onChange={setEmail} />

         <div className="grid gap-4">
            <Alert>
               <Info />
               <AlertTitle>2. Update how we sign in for you</AlertTitle>
               <AlertDescription>
                  Changing a sign-in method means it has to be checked again, so the status goes back to Pending. To see
                  what is saved, use Reveal credentials.
               </AlertDescription>
            </Alert>

            <CredentialsFields
               idPrefix="edit"
               values={values}
               onChange={change}
               saved={saved}
               cleared={cleared}
               onRemove={remove}
               onUndo={undo}
            />
         </div>

         {update.error ? (
            <Alert variant="destructive">
               <AlertTitle>We could not save your changes</AlertTitle>
               <AlertDescription>{readableError(update.error)}</AlertDescription>
            </Alert>
         ) : null}

         <DialogFooter className="items-center sm:justify-between">
            <p className="text-muted-foreground text-sm">{missing}</p>
            <div className="flex gap-2">
               <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
               </Button>
               <Button type="submit" disabled={Boolean(missing) || update.isPending}>
                  {update.isPending ? <Loader2 className="animate-spin" /> : null}
                  Save changes
               </Button>
            </div>
         </DialogFooter>
      </form>
   )
}

type Props = {
   account: Account | null
   onClose: () => void
}

// The form mounts only while open, so typed secrets are discarded on close.
export const EditAccountDialog = ({ account, onClose }: Props) => (
   <Dialog open={Boolean(account)} onOpenChange={open => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
         {account ? <EditForm key={account.id} account={account} onClose={onClose} /> : null}
      </DialogContent>
   </Dialog>
)
