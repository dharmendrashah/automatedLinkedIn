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
import { Textarea } from '@/components/ui/textarea'
import { readableError } from '@/lib/trpc-error'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { NOTE_CHARS, NOTE_FIELDS, insertField } from './invite-rules'

import { trpc } from '../../trpc'

type Props = {
   clientId: string
   // The people to invite (up to 100); none closes the dialog.
   personIds: string[]
   // The Found by filter the owner was looking at, credited with the accepts.
   source: string | undefined
   onClose: () => void
   onDone: () => void
}

// Invites to one person or a selection: the account (only with several), a note with the person's own name and company put in, and
// the one sentence of what is safe to send today and how the rest spreads over the days. Brain plans and checks everything again.
export const InviteDialog = ({ clientId, personIds, source, onClose, onDone }: Props) => {
   const utils = trpc.useUtils()
   const [accountId, setAccountId] = useState<string | undefined>()
   const [note, setNote] = useState('')
   const box = useRef<HTMLTextAreaElement>(null)
   const open = personIds.length > 0
   const plan = trpc.people.invitePlan.useQuery(
      {
         clientId,
         personIds,
         ...(accountId && { accountId }),
      },
      {
         enabled: open,
         retry: false,
      }
   )
   const invite = trpc.people.invite.useMutation({
      onSuccess: async result => {
         toast.success(`${result.queued} ${result.queued === 1 ? 'invite' : 'invites'} queued.`)
         await utils.people.invalidate()
         onDone()
      },
      onError: error => toast.error(readableError(error)),
   })
   const chosen = accountId ?? plan.data?.accountId

   const insert = (field: string) => {
      const at = box.current?.selectionStart ?? note.length

      setNote(insertField(note, field, at))
      box.current?.focus()
   }

   return (
      <Dialog open={open} onOpenChange={next => (next ? undefined : onClose())}>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>{personIds.length === 1 ? 'Invite to connect' : `Invite ${personIds.length} people`}</DialogTitle>
               <DialogDescription>
                  Each invite goes from the account&apos;s own LinkedIn, at most 20 a day and 100 a week, 30 to 90 seconds
                  apart, in its working hours.
               </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
               {plan.data && plan.data.accounts.length > 1 ? (
                  <div className="grid gap-1.5">
                     <Label htmlFor="invite-account">Send from</Label>
                     <Select value={chosen} onValueChange={setAccountId}>
                        <SelectTrigger id="invite-account" size="sm">
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           {plan.data.accounts.map(({ id, name }) => (
                              <SelectItem key={id} value={id}>
                                 {name}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
               ) : null}
               <div className="grid gap-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                     <Label htmlFor="invite-note">Note (optional)</Label>
                     <div className="flex gap-1">
                        <Button type="button" variant="outline" size="sm" onClick={() => insert(NOTE_FIELDS.firstName)}>
                           Insert first name
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => insert(NOTE_FIELDS.company)}>
                           Insert company
                        </Button>
                     </div>
                  </div>
                  <Textarea
                     id="invite-note"
                     ref={box}
                     value={note}
                     onChange={event => setNote(event.target.value.slice(0, NOTE_CHARS))}
                     placeholder="Hi {first_name}, …"
                     rows={4}
                  />
                  <p className="text-muted-foreground text-xs tabular-nums">
                     {`${note.length} of ${NOTE_CHARS} characters. Free LinkedIn accounts may send only a few notes a month; an invite whose note LinkedIn refuses is not sent and says so.`}
                  </p>
               </div>
               {plan.isPending ? <p className="text-muted-foreground text-sm">Planning…</p> : null}
               {plan.data ? (
                  <p className="text-sm" role="status">
                     {plan.data.sentence}
                  </p>
               ) : null}
               {plan.error ? <p className="text-destructive text-sm">{readableError(plan.error)}</p> : null}
            </div>
            <DialogFooter>
               <Button variant="outline" onClick={onClose}>
                  Cancel
               </Button>
               <Button
                  disabled={!plan.data || plan.data.toInvite === 0 || invite.isPending}
                  onClick={() =>
                     invite.mutate({
                        clientId,
                        personIds,
                        ...(chosen && { accountId: chosen }),
                        ...(note.trim() && { note: note.trim() }),
                        ...(source && { source }),
                     })
                  }
               >
                  {plan.data && plan.data.toInvite > 0 ? `Invite ${plan.data.toInvite}` : 'Invite'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   )
}
