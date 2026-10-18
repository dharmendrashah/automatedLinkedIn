import { readableError } from '@/lib/trpc-error'
import { useRef } from 'react'
import { toast } from 'sonner'

import { messageFor, staleSignal } from './message'
import { type InboxMember, type ListSummary, type MemberStatus, memberStatuses, workStatus } from './types'

import { trpc } from '../../trpc'

// What the inbox can do to one or many people, each with a 5-second undo (Z undoes the last one). Do not contact is the
// only action without an undo.

const UNDO_MS = 5_000

const people = (count: number) => `${count} ${count === 1 ? 'person' : 'people'}`

const groupBy = <K,>(members: InboxMember[], key: (member: InboxMember) => K) => {
   const groups = new Map<K, string[]>()

   for (const member of members) {
      groups.set(key(member), [...(groups.get(key(member)) ?? []), member.id])
   }

   return groups
}

const statusOf = (member: InboxMember) => workStatus(member.status)

export const useInboxActions = () => {
   const utils = trpc.useUtils()
   const lastUndo = useRef<(() => void) | null>(null)
   const refresh = () => {
      void utils.workflowList.inbox.invalidate()
      void utils.workflowList.lists.invalidate()
      void utils.workflowList.doNotContactList.invalidate()
      void utils.person.detail.invalidate()
   }
   const onError = (error: { message: string }) => {
      toast.error(readableError(error))
   }
   const options = {
      onSuccess: refresh,
      onError,
   }
   const setStatus = trpc.workflowList.setStatus.useMutation(options)
   const moveMany = trpc.workflowList.moveMany.useMutation(options)
   const removeMany = trpc.workflowList.removeMany.useMutation(options)
   const restore = trpc.workflowList.restore.useMutation(options)
   const doNotContact = trpc.workflowList.doNotContact.useMutation()

   const offerUndo = (message: string, undo: () => void) => {
      lastUndo.current = undo

      // Z only undoes what the toast still offers.
      const expire = () => {
         if (lastUndo.current === undo) {
            lastUndo.current = null
         }
      }

      toast(message, {
         duration: UNDO_MS,
         onAutoClose: expire,
         onDismiss: expire,
         action: {
            label: 'Undo',
            onClick: () => {
               lastUndo.current = null
               undo()
            },
         },
      })
   }

   const changeStatus = (members: InboxMember[], status: MemberStatus) => {
      const changing = members.filter(member => statusOf(member) !== status)
      const before = groupBy(changing, statusOf)

      if (changing.length === 0) {
         return
      }

      setStatus.mutate(
         {
            ids: changing.map(({ id }) => id),
            status,
         },
         {
            onSuccess: () =>
               offerUndo(`${people(changing.length)} marked ${memberStatuses[status].label.toLowerCase()}.`, () =>
                  before.forEach((ids, previous) =>
                     setStatus.mutate({
                        ids,
                        status: previous,
                     })
                  )
               ),
         }
      )
   }

   const move = (members: InboxMember[], list: ListSummary) => {
      const changing = members.filter(member => member.listId !== list.id)
      const before = groupBy(changing, member => member.listId)

      moveMany.mutate(
         {
            ids: changing.map(({ id }) => id),
            listId: list.id,
         },
         {
            onSuccess: () =>
               offerUndo(`${people(changing.length)} moved to ${list.name}.`, () =>
                  before.forEach((ids, listId) =>
                     moveMany.mutate({
                        ids,
                        listId,
                     })
                  )
               ),
         }
      )
   }

   const remove = (members: InboxMember[]) =>
      removeMany.mutate(
         { ids: members.map(({ id }) => id) },
         {
            onSuccess: removed =>
               offerUndo(`${people(removed.length)} removed. A workflow may find them again.`, () =>
                  restore.mutate({ people: removed })
               ),
         }
      )

   // One at a time, as each one also removes the person from every list.
   const block = async (members: InboxMember[]) => {
      let failed = 0

      for (const member of members) {
         await doNotContact.mutateAsync({ id: member.id }).catch(() => {
            failed += 1
         })
      }

      refresh()

      const done = members.length - failed

      if (done > 0) {
         toast(`${people(done)} marked do not contact. No workflow will add them again.`)
      }

      if (failed > 0) {
         toast.error(`${people(failed)} could not be marked do not contact. Please try again.`)
      }
   }

   // Copies first, while the page still has focus, then opens their profile.
   const message = (member: InboxMember) => {
      navigator.clipboard.writeText(messageFor(member)).then(
         () =>
            toast('Message copied. Paste it on LinkedIn.', {
               description: staleSignal(member.signals) ? 'Their last signal is over 30 days old.' : undefined,
               duration: 10_000,
               action: {
                  label: 'Mark contacted',
                  onClick: () => changeStatus([member], 'CONTACTED'),
               },
            }),
         () => toast.error('The message could not be copied. Allow clipboard access and try again.')
      )
      window.open(member.url, '_blank', 'noopener,noreferrer')
   }

   return {
      changeStatus,
      move,
      remove,
      block,
      message,
      undoLast: () => lastUndo.current?.(),
      busy: [setStatus, moveMany, removeMany, restore, doNotContact].some(action => action.isPending),
   }
}
