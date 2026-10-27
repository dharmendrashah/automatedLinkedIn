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
   // How many are about to be ignored; the dialog is closed when it is zero.
   count: number
   onConfirm: () => void
   onCancel: () => void
}

// Ignoring several at once is asked twice: once here, and then the usual few seconds to undo it.
export const ConfirmIgnoreDialog = ({ count, onConfirm, onCancel }: Props) => (
   <AlertDialog open={count > 0} onOpenChange={open => (open ? undefined : onCancel())}>
      <AlertDialogContent>
         <AlertDialogHeader>
            <AlertDialogTitle>Ignore {count} requests?</AlertDialogTitle>
            <AlertDialogDescription>
               These requests are answered on LinkedIn with Ignore. You get a few seconds to undo it before anything is
               sent.
            </AlertDialogDescription>
         </AlertDialogHeader>
         <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>Ignore {count}</AlertDialogAction>
         </AlertDialogFooter>
      </AlertDialogContent>
   </AlertDialog>
)
