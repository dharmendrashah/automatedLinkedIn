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

const SHOWN = 6

type Props = {
   // The accounts about to be paused; null keeps the dialog closed.
   accounts: Account[] | null
   onConfirm: () => void
   onCancel: () => void
}

// Pausing stops an account's visits and planned posts, so it asks first and names who is paused. Resume never asks.
export const PauseDialog = ({ accounts, onConfirm, onCancel }: Props) => {
   const list = (accounts ?? []).filter(({ status }) => status !== 'DISABLED')
   const [first] = list

   return (
      <AlertDialog open={accounts !== null} onOpenChange={open => (open ? undefined : onCancel())}>
         <AlertDialogContent>
            <AlertDialogHeader>
               <AlertDialogTitle>
                  {list.length === 1 ? `Pause ${first?.email}?` : `Pause ${list.length} accounts?`}
               </AlertDialogTitle>
               <AlertDialogDescription asChild>
                  <div className="grid gap-2">
                     <p>Daily visits and any planned posts stop until you resume. You can undo it right after.</p>
                     {list.length > 1 ? (
                        <ul className="list-disc pl-5">
                           {list.slice(0, SHOWN).map(({ id, email }) => (
                              <li key={id}>{email}</li>
                           ))}
                           {list.length > SHOWN ? <li>and {list.length - SHOWN} more</li> : null}
                        </ul>
                     ) : null}
                  </div>
               </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
               <AlertDialogCancel>Keep running</AlertDialogCancel>
               <AlertDialogAction onClick={onConfirm}>Pause</AlertDialogAction>
            </AlertDialogFooter>
         </AlertDialogContent>
      </AlertDialog>
   )
}
