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

type Props = {
   // The person being removed; null while nothing waits for an answer.
   name: string | null
   onConfirm: () => void
   onCancel: () => void
}

// Removing a connection cannot be undone from here, so it is asked once, with the person's name in it. Cancel is the default action.
export const RemoveDialog = ({ name, onConfirm, onCancel }: Props) => (
   <AlertDialog
      open={name !== null}
      onOpenChange={open => {
         if (!open) {
            onCancel()
         }
      }}
   >
      <AlertDialogContent>
         <AlertDialogHeader>
            <AlertDialogTitle>Remove {name} from your connections?</AlertDialogTitle>
            <AlertDialogDescription>
               LinkedIn removes the connection from this account. This page cannot undo it: to be connected again, one
               of you has to send a new request.
            </AlertDialogDescription>
         </AlertDialogHeader>
         <AlertDialogFooter>
            <AlertDialogCancel autoFocus>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onConfirm}>
               Remove connection
            </AlertDialogAction>
         </AlertDialogFooter>
      </AlertDialogContent>
   </AlertDialog>
)
