import { useState } from 'react'

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
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

type Props = {
   // What the server said about why the account may not browse now; null while nothing waits for an answer.
   message: string | null
   onConfirm: () => void
   onCancel: () => void
}

// Whether a failed request was refused because the account may not browse now (its rest between two sessions, its working
// hours or its day), as the server says it.
export const isBudgetRefusal = (error: { data?: { budgetRefusal?: boolean } | null }) => error.data?.budgetRefusal === true

// The owner may start it anyway, after saying they understand the risk to the account.
export const StartAnywayDialog = ({ message, onConfirm, onCancel }: Props) => {
   const [understood, setUnderstood] = useState(false)
   const reset = () => setUnderstood(false)

   return (
      <AlertDialog
         open={message !== null}
         onOpenChange={open => {
            if (!open) {
               reset()
               onCancel()
            }
         }}
      >
         <AlertDialogContent>
            <AlertDialogHeader>
               <AlertDialogTitle>This account is not meant to browse now</AlertDialogTitle>
               <AlertDialogDescription>
                  {message} Starting it now is not how a person uses LinkedIn, and it can put the account at risk.
               </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex items-center gap-2">
               <Checkbox id="start-anyway" checked={understood} onCheckedChange={value => setUnderstood(value === true)} />
               <Label htmlFor="start-anyway">I understand this can put the account at risk.</Label>
            </div>
            <AlertDialogFooter>
               <AlertDialogCancel>Cancel</AlertDialogCancel>
               <AlertDialogAction
                  disabled={!understood}
                  onClick={() => {
                     reset()
                     onConfirm()
                  }}
               >
                  Start anyway
               </AlertDialogAction>
            </AlertDialogFooter>
         </AlertDialogContent>
      </AlertDialog>
   )
}
