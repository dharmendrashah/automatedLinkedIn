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

import { type Account } from './types'

type Props = {
   // The account whose messages are about to be read; null keeps the dialog closed.
   account: Account | null
   onConfirm: () => void
   onCancel: () => void
}

// Reading the messages opens conversations on LinkedIn, which marks them read there and the other person sees it, so it asks first.
export const ReadMessagesDialog = ({ account, onConfirm, onCancel }: Props) => (
   <AlertDialog open={account !== null} onOpenChange={open => (open ? undefined : onCancel())}>
      <AlertDialogContent>
         <AlertDialogHeader>
            <AlertDialogTitle>Check the messages of {account?.email} now?</AlertDialogTitle>
            <AlertDialogDescription>
               Nothing is sent or accepted. Checking messages marks them as read on LinkedIn, and the other person sees
               it. The account does this by itself every 2 hours.
            </AlertDialogDescription>
         </AlertDialogHeader>
         <AlertDialogFooter>
            <AlertDialogCancel>Not now</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>Check now</AlertDialogAction>
         </AlertDialogFooter>
      </AlertDialogContent>
   </AlertDialog>
)
