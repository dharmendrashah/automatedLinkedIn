import { readableError } from '@/lib/trpc-error'
import { useState } from 'react'
import { toast } from 'sonner'

import { trpc } from '../../trpc'
import { positiveAction } from './positive-action'

// The positive lead of one open conversation (.plan/unibox-mark-positive-button.md): what is counted, and the one press that counts or
// removes it. The header button, the P key and the Details panel all use it, and share one cached answer per conversation.
export const usePositiveReply = (conversationId: string | undefined) => {
   const utils = trpc.useUtils()
   const info = trpc.positiveReply.forConversation.useQuery(
      { conversationId: conversationId ?? '' },
      {
         enabled: Boolean(conversationId),
         retry: false,
      }
   )
   const [choosingFor, setChoosingFor] = useState<string | null>(null)
   const changed = async () => {
      await Promise.all([
         info.refetch(),
         utils.positiveReply.pipeline.invalidate(),
         utils.positiveReply.leads.invalidate(),
      ])
   }
   const mark = trpc.positiveReply.mark.useMutation({ onSuccess: changed })
   const unmark = trpc.positiveReply.unmark.useMutation({ onSuccess: changed })
   const data = info.data
   const campaigns = data?.campaigns ?? []
   const replies = (data?.replies ?? []).filter(({ state }) => state === 'COUNTED')
   const counted = new Set(replies.map(({ campaignId }) => campaignId))
   const suggestedCampaignId = data?.suggestedCampaignId ?? null
   const nameOf = (campaignId: string | null) =>
      campaigns.find(({ id }) => id === campaignId)?.name ?? 'no campaign yet'

   const set = async (campaignId: string | null, on: boolean) => {
      if (!conversationId) {
         return
      }

      try {
         await (on ? mark : unmark).mutateAsync({
            conversationId,
            campaignId,
         })
      } catch (error) {
         toast.error(readableError(error instanceof Error ? error : new Error('Could not save.')))

         return
      }

      const campaign = campaigns.find(({ id }) => id === campaignId)

      toast(on ? `Counted as a positive lead in ${nameOf(campaignId)}` : `Removed from ${nameOf(campaignId)}`, {
         ...(on &&
            campaign?.replyValueUsd === null && { description: 'Set what a reply is worth on the campaign page.' }),
         action: {
            label: 'Undo',
            onClick: () => void set(campaignId, !on),
         },
      })
   }

   const press = () => {
      const action = positiveAction({
         campaigns,
         counted,
         suggestedCampaignId,
      })

      if (action.kind === 'choose') {
         setChoosingFor(current => (current === conversationId ? null : (conversationId ?? null)))

         return
      }

      void set(action.campaignId, action.kind === 'mark')
   }

   return {
      canMark: Boolean(conversationId && data?.canMark),
      campaigns,
      replies,
      counted,
      suggestedCampaignId,
      pending: mark.isPending || unmark.isPending,
      error: mark.error ?? unmark.error,
      choosing: choosingFor !== null && choosingFor === conversationId,
      setChoosing: (open: boolean) => setChoosingFor(open ? (conversationId ?? null) : null),
      set,
      press,
   }
}

export type PositiveState = ReturnType<typeof usePositiveReply>
