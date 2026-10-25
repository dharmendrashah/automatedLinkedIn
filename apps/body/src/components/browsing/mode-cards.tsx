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
import { Check } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

import { type BrowseMode } from './types'

import { MODES, modeOf } from './modes'

type Props = {
   // Undefined when the accounts being changed do not share one mode.
   mode: BrowseMode | undefined
   onChange: (mode: BrowseMode) => void
}

// The three daily limits as cards. A pick saves at once (the caller offers Undo); Aggressive asks first.
export const ModeCards = ({ mode, onChange }: Props) => {
   const [confirming, setConfirming] = useState(false)

   const pick = (next: BrowseMode) => {
      if (next === 'AGGRESSIVE' && mode !== 'AGGRESSIVE') {
         setConfirming(true)
      } else if (next !== mode) {
         onChange(next)
      }
   }

   return (
      <>
         <div role="radiogroup" aria-label="Daily browsing limit" className="grid gap-2 sm:grid-cols-3">
            {MODES.map(item => {
               const selected = item.mode === mode

               return (
                  <button
                     key={item.mode}
                     type="button"
                     role="radio"
                     aria-checked={selected}
                     className={cn(
                        'hover:bg-muted/50 focus-visible:ring-ring/50 grid content-start gap-1 rounded-lg border p-3 text-left outline-none focus-visible:ring-[3px]',
                        selected && 'border-primary bg-primary/5 ring-primary ring-1'
                     )}
                     onClick={() => pick(item.mode)}
                  >
                     <span className="flex items-center justify-between text-sm font-medium">
                        {item.label}
                        {selected ? <Check className="text-primary size-4" aria-hidden /> : null}
                     </span>
                     <span className="text-2xl font-semibold tabular-nums">
                        {item.minutes}
                        <span className="text-muted-foreground ml-1 text-sm font-normal">min a day</span>
                     </span>
                     <span className="text-muted-foreground text-xs">{item.line}</span>
                  </button>
               )
            })}
         </div>
         <AlertDialog open={confirming} onOpenChange={setConfirming}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Use Aggressive?</AlertDialogTitle>
                  <AlertDialogDescription>
                     {modeOf('AGGRESSIVE').minutes} minutes a day is the most activity, and the highest chance that
                     LinkedIn restricts the account. You can go back to a lower limit at any time.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel>Keep the current limit</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onChange('AGGRESSIVE')}>Use Aggressive</AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </>
   )
}
