import { isReading, money, pollWhile } from '@/components/details/read-status'
import {
   AlertDialog,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { readableError } from '@/lib/trpc-error'
import { Loader2 } from 'lucide-react'

import { trpc } from '../../trpc'

type Props = {
   // The person to read, or null when closed.
   person: { slug: string; name: string } | null
   clientId: string
   onClose: () => void
}

// The paid full read from a row: the price and what it adds first, then the read only on the button; nothing is paid on Cancel.
export const ReadProfileDialog = ({ person, clientId, onClose }: Props) => {
   const utils = trpc.useUtils()
   const detail = trpc.person.detail.useQuery(
      { slug: person?.slug ?? '' },
      {
         enabled: person !== null,
         refetchInterval: query => pollWhile(query.state.data?.read),
      }
   )
   const read = trpc.person.readFull.useMutation({
      onSuccess: async data => {
         if (person) {
            utils.person.detail.setData({ slug: person.slug }, data)
         }

         await utils.people.invalidate()
      },
   })
   const first = person?.name.split(/\s+/)[0] ?? ''
   const data = detail.data
   const reading = isReading(data?.read)
   const readAt = data?.snapshot?.fetchedAt ?? null

   return (
      <AlertDialog open={person !== null} onOpenChange={open => (open ? undefined : onClose())}>
         <AlertDialogContent>
            <AlertDialogHeader>
               <AlertDialogTitle>Read {person?.name}&apos;s full profile?</AlertDialogTitle>
               <AlertDialogDescription>
                  It adds {first}&apos;s about, experience, education, skills, title and country, and is paid from your
                  wallet{data ? ` (about ${money(data.readPriceMicros)})` : ''}.
               </AlertDialogDescription>
            </AlertDialogHeader>
            {detail.error ? <p className="text-destructive text-sm">{readableError(detail.error)}</p> : null}
            {data?.suppressed ? (
               <p className="text-sm">{first} is on Do not contact; the profile is not read.</p>
            ) : null}
            {reading ? (
               <p className="text-sm">Reading now. You can close this; the row updates when it is done.</p>
            ) : null}
            {readAt && !reading ? (
               <p className="text-muted-foreground text-sm">Read {new Date(readAt).toLocaleDateString()}.</p>
            ) : null}
            {data?.read?.status === 'FAILED' && data.read.message ? (
               <p className="text-destructive text-sm">{data.read.message}</p>
            ) : null}
            {read.error ? <p className="text-destructive text-sm">{readableError(read.error)}</p> : null}
            <AlertDialogFooter>
               <AlertDialogCancel>{reading ? 'Close' : 'Cancel'}</AlertDialogCancel>
               <Button
                  disabled={!data || data.suppressed || reading || read.isPending}
                  onClick={() => (person ? read.mutate({ slug: person.slug, clientId }) : undefined)}
               >
                  {read.isPending ? <Loader2 className="animate-spin" /> : null}
                  {readAt ? 'Read again' : 'Read profile'}
               </Button>
            </AlertDialogFooter>
         </AlertDialogContent>
      </AlertDialog>
   )
}
