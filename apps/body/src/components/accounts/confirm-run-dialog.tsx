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
   // What the server said about the recent run; null while nothing waits for an answer.
   message: string | null
   onConfirm: () => void
   onCancel: () => void
}

export const ConfirmRunDialog = ({ message, onConfirm, onCancel }: Props) => (
   <AlertDialog open={message !== null} onOpenChange={open => (open ? undefined : onCancel())}>
      <AlertDialogContent>
         <AlertDialogHeader>
            <AlertDialogTitle>This ran a moment ago</AlertDialogTitle>
            <AlertDialogDescription>
               {message} Running it again so soon is not how a person uses LinkedIn. Run it now anyway?
            </AlertDialogDescription>
         </AlertDialogHeader>
         <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>Run anyway</AlertDialogAction>
         </AlertDialogFooter>
      </AlertDialogContent>
   </AlertDialog>
)
