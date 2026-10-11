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
   account: Account | null
   onConfirm: (account: Account) => void
   onCancel: () => void
}

export const DeleteAccountDialog = ({ account, onConfirm, onCancel }: Props) => (
   <AlertDialog open={Boolean(account)} onOpenChange={open => (open ? undefined : onCancel())}>
      <AlertDialogContent>
         <AlertDialogHeader>
            <AlertDialogTitle>Remove {account?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
               The stored password, TOTP secret and session are deleted. This cannot be undone.
            </AlertDialogDescription>
         </AlertDialogHeader>
         <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => account && onConfirm(account)}>Remove</AlertDialogAction>
         </AlertDialogFooter>
      </AlertDialogContent>
   </AlertDialog>
)
