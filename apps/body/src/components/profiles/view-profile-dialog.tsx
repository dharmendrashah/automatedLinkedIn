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
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link } from 'react-router'

import { type Profile } from './types'
import { accountChoices, isProfileLink } from './visit-form'

import { trpc } from '../../trpc'
import { ConfirmRunDialog } from '../accounts/confirm-run-dialog'
import { TextField } from '../links/record-fields'

type Props = {
   // The saved profile to view, or null to paste a link.
   profile: Pick<Profile, 'id' | 'fullName' | 'slug'> | null
   onClose: () => void
}

// Asks one of the owner's accounts to view a profile: it opens it, waits a few seconds and scrolls down, so the member sees a visit.
export const ViewProfileDialog = ({ profile, onClose }: Props) => {
   const utils = trpc.useUtils()
   const accounts = trpc.linkedInAccount.list.useQuery(undefined, { retry: false })
   const [picked, setPicked] = useState('')
   const [link, setLink] = useState('')
   // The server holds a visit that follows another one of the account too soon; the owner can confirm and go on.
   const [recent, setRecent] = useState<string | null>(null)
   const visit = trpc.linkedInProfile.visit.useMutation({
      onSuccess: () => {
         void utils.linkedInProfile.list.invalidate()
         void utils.session.list.invalidate()
      },
      onError: error => {
         if (error.data?.code === 'CONFLICT') {
            setRecent(error.message)
         }
      },
   })

   const choices = accountChoices(accounts.data ?? [])
   const accountId = picked || (choices.find(({ blocker }) => !blocker)?.id ?? '')
   const target = profile ? { profileId: profile.id } : { link: link.trim() }
   const ready = Boolean(accountId) && (profile !== null || isProfileLink(link)) && !visit.isPending
   const name = profile ? (profile.fullName ?? profile.slug) : null

   const ask = (confirmed?: boolean) =>
      visit.mutate({
         accountId,
         ...target,
         confirmed,
      })

   const submit = (event: FormEvent) => {
      event.preventDefault()
      ask()
   }

   return (
      <Dialog open onOpenChange={open => (open ? undefined : onClose())}>
         <DialogContent className="sm:max-w-xl">
            <form onSubmit={submit} className="grid gap-6">
               <DialogHeader>
                  <DialogTitle>{name ? `View ${name}’s profile` : 'View someone’s profile'}</DialogTitle>
                  <DialogDescription>
                     The account opens the profile, waits a few seconds and scrolls down to the end. It clicks nothing.
                  </DialogDescription>
               </DialogHeader>
               <div className="grid gap-4">
                  {profile ? null : (
                     <TextField
                        id="visit-link"
                        label="Profile link"
                        maxLength={500}
                        value={link}
                        onChange={setLink}
                     />
                  )}
                  <div className="grid gap-2">
                     <Label htmlFor="visit-account">View with</Label>
                     <Select value={accountId} onValueChange={setPicked}>
                        <SelectTrigger id="visit-account">
                           <SelectValue placeholder={accounts.isPending ? 'Loading accounts' : 'No account to use'} />
                        </SelectTrigger>
                        <SelectContent>
                           {choices.map(({ id, email, blocker }) => (
                              <SelectItem key={id} value={id} disabled={Boolean(blocker)}>
                                 {email}
                                 {blocker ? ` (${blocker})` : ''}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
                  <Alert>
                     <AlertDescription>
                        <p>
                           They will see that this account viewed their profile, unless that account’s LinkedIn
                           visibility setting hides it. This app does not change that setting, so it cannot promise
                           they are told.
                        </p>
                        <p className="mt-2">
                           At most 15 views a day for each account, and the same person only once in 30 days.
                        </p>
                     </AlertDescription>
                  </Alert>
                  {visit.error && !recent ? <p className="text-destructive text-sm">{visit.error.message}</p> : null}
                  {visit.data ? (
                     <p className="text-sm" role="status">
                        Started.{' '}
                        <Link className="underline underline-offset-4" to={`/sessions?session=${visit.data.id}`}>
                           Follow it in Sessions
                        </Link>
                        .
                     </p>
                  ) : null}
               </div>
               <DialogFooter>
                  <Button type="button" variant="outline" onClick={onClose}>
                     {visit.data ? 'Close' : 'Cancel'}
                  </Button>
                  {visit.data ? null : (
                     <Button type="submit" disabled={!ready}>
                        {visit.isPending ? <Loader2 className="animate-spin" /> : null}
                        View profile
                     </Button>
                  )}
               </DialogFooter>
            </form>
            <ConfirmRunDialog
               message={recent}
               onCancel={() => setRecent(null)}
               onConfirm={() => {
                  ask(true)
                  setRecent(null)
               }}
            />
         </DialogContent>
      </Dialog>
   )
}
