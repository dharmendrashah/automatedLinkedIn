import { FailureCard } from '@/components/failure-card'
import { PageStatus } from '@/components/page-status'
import { Studio } from '@/components/posting/studio'
import { readableError } from '@/lib/trpc-error'
import { useState } from 'react'
import { useParams } from 'react-router'

import { trpc } from '../trpc'

// Step two: the canvas for one account's post, new or an existing draft. It reads what the address says once, when it opens: a
// draft created while writing changes the address but not what is on screen, so the files picked so far are not lost.
export const PostingCanvas = () => {
   const params = useParams()
   const [opened] = useState({
      accountId: params.accountId ?? '',
      draftId: params.draftId,
   })
   const accounts = trpc.linkedInAccount.list.useQuery(undefined, { retry: false })
   // Not kept after the page is left, so opening a draft again never shows an older copy of it.
   const stored = trpc.postDraft.get.useQuery(
      { id: opened.draftId ?? '' },
      {
         enabled: Boolean(opened.draftId),
         retry: false,
         gcTime: 0,
      }
   )

   if (accounts.error ?? stored.error) {
      const error = accounts.error ?? stored.error

      return (
         <FailureCard
            title="This post could not be opened"
            message={error ? readableError(error) : ''}
            to="/posting"
            action="Back to Write a post"
         />
      )
   }

   if (accounts.isPending || (opened.draftId && stored.isPending)) {
      return <PageStatus>Opening the post…</PageStatus>
   }

   const draft = stored.data
   const accountId = draft?.accountId ?? opened.accountId

   if (!accounts.data.some(({ id }) => id === accountId)) {
      return (
         <FailureCard
            title="Account not found"
            message="This LinkedIn account is not in your list."
            to="/posting"
            action="Back to Write a post"
         />
      )
   }

   return (
      <Studio
         accounts={accounts.data}
         initial={{
            draftId: draft?.id,
            accountId,
            blocks: draft?.blocks ?? [],
            audience: draft?.audience ?? 'ANYONE',
            comments: draft?.comments ?? 'ANYONE',
            planned:
               draft?.plannedAt && draft.plannedZone
                  ? {
                       at: draft.plannedAt,
                       zone: draft.plannedZone,
                    }
                  : null,
         }}
      />
   )
}
