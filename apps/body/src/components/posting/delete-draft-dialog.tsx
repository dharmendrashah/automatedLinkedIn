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

import type { Draft } from './drafts-list'

type Props = {
   draft: Draft | null
   onConfirm: (draft: Draft) => void
   onCancel: () => void
}

// A draft's files are deleted from the cloud with it, so it cannot be brought back.
export const DeleteDraftDialog = ({ draft, onConfirm, onCancel }: Props) => (
   <AlertDialog open={Boolean(draft)} onOpenChange={open => (open ? undefined : onCancel())}>
      <AlertDialogContent>
         <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
            <AlertDialogDescription>
               The text and the photos, video or document of this draft are deleted. This cannot be undone.
            </AlertDialogDescription>
         </AlertDialogHeader>
         <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => draft && onConfirm(draft)}>Delete</AlertDialogAction>
         </AlertDialogFooter>
      </AlertDialogContent>
   </AlertDialog>
)
