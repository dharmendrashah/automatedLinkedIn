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

import { accountChoices, isCompanyLink, isProfileLink } from './visit-form'

import { trpc } from '../../trpc'
import { ConfirmRunDialog } from '../accounts/confirm-run-dialog'
import { StartAnywayDialog, isBudgetRefusal } from '../accounts/start-anyway-dialog'
import { TextField } from './record-fields'

export type VisitKind = 'PROFILE' | 'COMPANY'

type Props = {
   kind: VisitKind
   // The saved page to view, or null to paste a link.
   saved: {
      id: string
      name: string
   } | null
   onClose: () => void
}

// What each kind says. The profile text may say that the member sees a visit; for a company page nobody is named, so it promises nothing.
const WORDS = {
   PROFILE: {
      titleFor: (name: string) => `View ${name}’s profile`,
      title: 'View someone’s profile',
      what: 'the profile',
      linkLabel: 'Profile link',
      button: 'View profile',
      notice:
         'They will see that this account viewed their profile, unless that account’s LinkedIn visibility setting hides it. This app does not change that setting, so it cannot promise they are told.',
      isLink: isProfileLink,
   },
   COMPANY: {
      titleFor: (name: string) => `View ${name}’s page`,
      title: 'View a company',
      what: 'the company page',
      linkLabel: 'Company link',
      button: 'View company',
      notice:
         'LinkedIn may show the people who run the page that this account viewed it, depending on that account’s visibility setting and the page’s own tools. This app cannot promise anyone is told.',
      isLink: isCompanyLink,
   },
} as const

// Asks one of the owner's accounts to view a profile or a company page: it opens it, waits a few seconds and scrolls down.
export const ViewPageDialog = ({ kind, saved, onClose }: Props) => {
   const words = WORDS[kind]
   const utils = trpc.useUtils()
   const accounts = trpc.linkedInAccount.list.useQuery(undefined, { retry: false })
   const [picked, setPicked] = useState('')
   const [link, setLink] = useState('')
   // The server holds a visit that follows another one of the account too soon; the owner can confirm and go on.
   const [recent, setRecent] = useState<string | null>(null)
   // The account may not browse now; the owner can go on anyway after saying they understand the risk.
   const [blocked, setBlocked] = useState<string | null>(null)
   const options = {
      onSuccess: () => {
         void utils.linkedInProfile.list.invalidate()
         void utils.linkedInCompany.list.invalidate()
         void utils.session.list.invalidate()
      },
      onError: (error: { data?: { code?: string; budgetRefusal?: boolean } | null; message: string }) => {
         if (error.data?.code === 'CONFLICT') {
            setRecent(error.message)
         } else if (isBudgetRefusal(error)) {
            setBlocked(error.message)
         }
      },
   }
   const profileVisit = trpc.linkedInProfile.visit.useMutation(options)
   const companyVisit = trpc.linkedInCompany.visit.useMutation(options)
   const visit = kind === 'PROFILE' ? profileVisit : companyVisit

   const choices = accountChoices(accounts.data ?? [])
   const accountId = picked || (choices.find(({ blocker }) => !blocker)?.id ?? '')
   const target = saved ? { id: saved.id } : { link: link.trim() }
   const ready = Boolean(accountId) && (saved !== null || words.isLink(link)) && !visit.isPending

   const ask = (confirmed?: boolean, startAnyway?: boolean) =>
      visit.mutate({
         accountId,
         ...target,
         confirmed,
         startAnyway,
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
                  <DialogTitle>{saved ? words.titleFor(saved.name) : words.title}</DialogTitle>
                  <DialogDescription>
                     The account opens {words.what}, waits a few seconds and scrolls down to the end. It clicks nothing.
                  </DialogDescription>
               </DialogHeader>
               <div className="grid gap-4">
                  {saved ? null : (
                     <TextField
                        id="visit-link"
                        label={words.linkLabel}
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
                        <p>{words.notice}</p>
                        <p className="mt-2">
                           At most 15 page views a day for each account, profiles and companies together, and the same
                           page only once in 30 days.
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
                        {words.button}
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
            <StartAnywayDialog
               message={blocked}
               onCancel={() => setBlocked(null)}
               onConfirm={() => {
                  ask(true, true)
                  setBlocked(null)
               }}
            />
         </DialogContent>
      </Dialog>
   )
}
