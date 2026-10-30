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

type Read = { status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED'; message: string | null } | null

type DialogProps = {
   open: boolean
   title: string
   // What the read adds; the price is added to it once known.
   adds: string
   priceMicros: number | undefined
   read: Read | undefined
   readAt: string | null
   // Why it cannot be read now, if so.
   blocked: string | null
   loadError: { message: string } | null
   sendError: { message: string } | null
   pending: boolean
   action: string
   onRead: () => void
   onClose: () => void
}

// A paid read asked from a row: the price and what it adds first, the read only on the button; nothing is paid on Cancel.
const PaidReadDialog = ({
   open,
   title,
   adds,
   priceMicros,
   read,
   readAt,
   blocked,
   loadError,
   sendError,
   pending,
   action,
   onRead,
   onClose,
}: DialogProps) => {
   const reading = isReading(read)

   return (
      <AlertDialog open={open} onOpenChange={next => (next ? undefined : onClose())}>
         <AlertDialogContent>
            <AlertDialogHeader>
               <AlertDialogTitle>{title}</AlertDialogTitle>
               <AlertDialogDescription>
                  {adds}, paid from your wallet{priceMicros === undefined ? '' : ` (about ${money(priceMicros)})`}.
               </AlertDialogDescription>
            </AlertDialogHeader>
            {loadError ? <p className="text-destructive text-sm">{readableError(loadError)}</p> : null}
            {blocked ? <p className="text-sm">{blocked}</p> : null}
            {reading ? (
               <p className="text-sm">Reading now. You can close this; the row updates when it is done.</p>
            ) : null}
            {readAt && !reading ? (
               <p className="text-muted-foreground text-sm">Read {new Date(readAt).toLocaleDateString()}.</p>
            ) : null}
            {read?.status === 'FAILED' && read.message ? (
               <p className="text-destructive text-sm">{read.message}</p>
            ) : null}
            {sendError ? <p className="text-destructive text-sm">{readableError(sendError)}</p> : null}
            <AlertDialogFooter>
               <AlertDialogCancel>{reading ? 'Close' : 'Cancel'}</AlertDialogCancel>
               <Button disabled={priceMicros === undefined || Boolean(blocked) || reading || pending} onClick={onRead}>
                  {pending ? <Loader2 className="animate-spin" /> : null}
                  {readAt ? 'Read again' : action}
               </Button>
            </AlertDialogFooter>
         </AlertDialogContent>
      </AlertDialog>
   )
}

// The person's full profile, booked to the client.
export const ReadProfileDialog = ({
   person,
   clientId,
   onClose,
}: {
   person: { slug: string; name: string } | null
   clientId: string
   onClose: () => void
}) => {
   const utils = trpc.useUtils()
   const slug = person?.slug ?? ''
   const detail = trpc.person.detail.useQuery(
      { slug },
      {
         enabled: person !== null,
         refetchInterval: query => pollWhile(query.state.data?.read),
      }
   )
   const read = trpc.person.readFull.useMutation({
      onSuccess: async data => {
         utils.person.detail.setData({ slug }, data)
         await utils.people.invalidate()
      },
   })
   const first = person?.name.split(/\s+/)[0] ?? ''
   const { data } = detail

   return (
      <PaidReadDialog
         open={person !== null}
         title={`Read ${person?.name ?? ''}'s full profile?`}
         adds={`It adds ${first}'s about, experience, education, skills, title, country, company and cover`}
         priceMicros={data?.readPriceMicros}
         read={data?.read}
         readAt={data?.snapshot?.fetchedAt ?? null}
         blocked={data?.suppressed ? `${first} is on Do not contact; the profile is not read.` : null}
         loadError={detail.error}
         sendError={read.error}
         pending={read.isPending}
         action="Read profile"
         onRead={() =>
            read.mutate({
               slug,
               clientId,
            })
         }
         onClose={onClose}
      />
   )
}

// The company page of the person's current company, which a profile read saved to /companies.
export const ReadCompanyDialog = ({
   company,
   onClose,
}: {
   company: { slug: string; name: string } | null
   onClose: () => void
}) => {
   const utils = trpc.useUtils()
   const slug = company?.slug ?? ''
   const detail = trpc.companyPage.detail.useQuery(
      { slug },
      {
         enabled: company !== null,
         refetchInterval: query => pollWhile(query.state.data?.read),
      }
   )
   const read = trpc.companyPage.readFull.useMutation({
      onSuccess: data => utils.companyPage.detail.setData({ slug }, data),
   })
   const { data } = detail

   return (
      <PaidReadDialog
         open={company !== null}
         title={`Read ${company?.name ?? 'the company'}'s company page?`}
         adds="It adds the company's about, industry, size, website and location"
         priceMicros={data?.readPriceMicros}
         read={data?.read}
         readAt={data?.snapshot?.fetchedAt ?? null}
         blocked={data?.company.archivedAt ? 'This company is archived. Restore it on Companies first.' : null}
         loadError={detail.error}
         sendError={read.error}
         pending={read.isPending}
         action="Read company"
         onRead={() => read.mutate({ slug })}
         onClose={onClose}
      />
   )
}
