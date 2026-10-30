import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { readableError } from '@/lib/trpc-error'
import { toast } from 'sonner'

import { trpc } from '../../trpc'
import { NameDialog } from './name-dialog'

export type ListManaging = 'rename' | 'delete' | null

type Props = {
   list: { id: string; name: string }
   managing: ListManaging
   onClose: () => void
   onDeleted: () => void
}

const LIST_NAME_MAX = 100

// Rename list and Delete list, opened from the Found by filter for the list it shows.
export const ListDialogs = ({ list, managing, onClose, onDeleted }: Props) => {
   const utils = trpc.useUtils()
   const rename = trpc.workflowList.renameList.useMutation({
      onSuccess: async () => {
         onClose()
         await utils.people.invalidate()
      },
   })
   const remove = trpc.workflowList.deleteList.useMutation({
      onSuccess: async () => {
         toast.success(`${list.name} was deleted.`)
         onDeleted()
         await utils.people.invalidate()
      },
      onError: error => toast.error(readableError(error)),
   })

   return (
      <>
         <NameDialog
            open={managing === 'rename'}
            onOpenChange={open => {
               if (!open) {
                  rename.reset()
                  onClose()
               }
            }}
            title={`Rename ${list.name}`}
            description="Only the name changes. Its people stay."
            label="List name"
            initial={list.name}
            maxLength={LIST_NAME_MAX}
            action="Rename"
            busy={rename.isPending}
            error={rename.error ? readableError(rename.error) : null}
            onSave={name =>
               rename.mutate({
                  id: list.id,
                  name,
               })
            }
         />
         <AlertDialog open={managing === 'delete'} onOpenChange={open => (open ? undefined : onClose())}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Delete {list.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                     The list is deleted. Its people stay on My network only if something else found them too: a
                     request, a connection, a chat, a target profile or another list. This cannot be undone.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction disabled={remove.isPending} onClick={() => remove.mutate({ id: list.id })}>
                     Delete list
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </>
   )
}
