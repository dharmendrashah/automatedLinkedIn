import { AccountCard } from '@/components/posting/account-card'
import { DeleteDraftDialog } from '@/components/posting/delete-draft-dialog'
import { DraftsList, type Draft } from '@/components/posting/drafts-list'
import { PageStatus } from '@/components/page-status'
import { readableError } from '@/lib/trpc-error'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { trpc } from '../trpc'

// Step one of writing a post: pick the account it is for. Below, the drafts already started.
export const Posting = () => {
   const utils = trpc.useUtils()
   const accounts = trpc.linkedInAccount.list.useQuery(undefined, { retry: false })
   const drafts = trpc.postDraft.list.useQuery(undefined, { retry: false })
   const [toDelete, setToDelete] = useState<Draft | null>(null)
   const remove = trpc.postDraft.remove.useMutation({
      onSuccess: () => {
         void utils.postDraft.list.invalidate()
         toast('Draft deleted')
      },
      onError: error => toast.error(readableError(error)),
   })

   if (accounts.isPending) {
      return <PageStatus>Loading your accounts…</PageStatus>
   }

   if (accounts.error) {
      return <p className="text-destructive px-4 text-sm lg:px-6">{readableError(accounts.error)}</p>
   }

   return (
      <div className="grid w-full gap-6 px-4 lg:px-6">
         <section className="grid gap-3" aria-labelledby="post-as">
            <div className="grid gap-1">
               <h2 id="post-as" className="text-lg font-semibold">
                  Who is this post from?
               </h2>
               <p className="text-muted-foreground text-sm">
                  Pick one of your LinkedIn accounts. The post is built for it and shown with its name and photo.
               </p>
            </div>
            {accounts.data.length === 0 ? (
               <p className="text-sm">
                  You have no LinkedIn account yet.{' '}
                  <Link className="underline underline-offset-4" to="/accounts">
                     Add one on the accounts page
                  </Link>{' '}
                  first.
               </p>
            ) : (
               <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {accounts.data.map(account => (
                     <AccountCard key={account.id} account={account} />
                  ))}
               </div>
            )}
         </section>

         <section className="grid gap-3" aria-labelledby="drafts">
            <h2 id="drafts" className="text-lg font-semibold">
               Your drafts
            </h2>
            {drafts.isPending ? <PageStatus>Loading your drafts…</PageStatus> : null}
            {drafts.error ? <p className="text-destructive text-sm">{readableError(drafts.error)}</p> : null}
            {drafts.data && drafts.data.items.length === 0 ? (
               <p className="text-muted-foreground text-sm">
                  No drafts yet. A post you start is saved here as you write it.
               </p>
            ) : null}
            {drafts.data && drafts.data.items.length > 0 ? (
               <DraftsList drafts={drafts.data.items} accounts={accounts.data} onRemove={setToDelete} />
            ) : null}
            {drafts.data && drafts.data.unreadable > 0 ? (
               <p className="text-muted-foreground text-xs">
                  {drafts.data.unreadable} {drafts.data.unreadable === 1 ? 'draft' : 'drafts'} could not be read and{' '}
                  {drafts.data.unreadable === 1 ? 'is' : 'are'} not shown.
               </p>
            ) : null}
         </section>
         <DeleteDraftDialog
            draft={toDelete}
            onCancel={() => setToDelete(null)}
            onConfirm={draft => {
               setToDelete(null)
               remove.mutate({ id: draft.id })
            }}
         />
      </div>
   )
}
