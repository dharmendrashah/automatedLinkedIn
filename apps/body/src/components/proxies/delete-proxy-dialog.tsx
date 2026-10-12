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

import { type Proxy } from './types'

type Props = {
   proxy: Proxy | null
   onConfirm: (proxy: Proxy) => void
   onCancel: () => void
}

export const DeleteProxyDialog = ({ proxy, onConfirm, onCancel }: Props) => (
   <AlertDialog open={Boolean(proxy)} onOpenChange={open => (open ? undefined : onCancel())}>
      <AlertDialogContent>
         <AlertDialogHeader>
            <AlertDialogTitle>
               Remove {proxy?.protocol.toLowerCase()}://{proxy?.host}:{proxy?.port}?
            </AlertDialogTitle>
            <AlertDialogDescription>
               {proxy?.linkedInAccount.email} will have one less proxy to automate through. This cannot be undone.
            </AlertDialogDescription>
         </AlertDialogHeader>
         <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => proxy && onConfirm(proxy)}>Remove</AlertDialogAction>
         </AlertDialogFooter>
      </AlertDialogContent>
   </AlertDialog>
)
