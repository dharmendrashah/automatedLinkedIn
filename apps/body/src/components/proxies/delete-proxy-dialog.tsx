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
   // How many other proxies the account has.
   others: number
   onConfirm: (proxy: Proxy) => void
   onCancel: () => void
}

const consequence = (proxy: Proxy | null, others: number) => {
   if (!proxy) return ''

   if (others === 0) {
      return `This is the only proxy of ${proxy.linkedInAccount.email}. Without one, nothing can run for that account until you add another.`
   }

   return proxy.isBest
      ? `${proxy.linkedInAccount.email} is using it right now. We will use its other proxies instead.`
      : `${proxy.linkedInAccount.email} will have one less proxy to fall back on.`
}

export const DeleteProxyDialog = ({ proxy, others, onConfirm, onCancel }: Props) => (
   <AlertDialog open={Boolean(proxy)} onOpenChange={open => (open ? undefined : onCancel())}>
      <AlertDialogContent>
         <AlertDialogHeader>
            <AlertDialogTitle>
               Remove {proxy?.protocol.toLowerCase()}://{proxy?.host}:{proxy?.port}?
            </AlertDialogTitle>
            <AlertDialogDescription>{consequence(proxy, others)} This cannot be undone.</AlertDialogDescription>
         </AlertDialogHeader>
         <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => proxy && onConfirm(proxy)}>Remove</AlertDialogAction>
         </AlertDialogFooter>
      </AlertDialogContent>
   </AlertDialog>
)
