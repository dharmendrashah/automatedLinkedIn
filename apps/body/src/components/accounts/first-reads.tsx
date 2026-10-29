import { Check, Clock } from 'lucide-react'

import { type Account } from './types'

import { firstReadsOf } from './firstReads'

// What the account has read of itself since it was added, and that the rest comes by itself.
export const FirstReads = ({ account }: { account: Account }) => (
   <div className="grid gap-2">
      <ul className="grid gap-1 text-sm">
         {firstReadsOf(account).map(({ label, done }) => (
            <li key={label} className="flex items-center gap-2">
               {done ? (
                  <Check className="text-success size-4" aria-hidden />
               ) : (
                  <Clock className="text-muted-foreground size-4" aria-hidden />
               )}
               <span>{label}</span>
               <span className="text-muted-foreground text-xs">{done ? 'Done' : 'To come'}</span>
            </li>
         ))}
      </ul>
      <p className="text-muted-foreground text-xs">
         These are read by themselves after the first sign-in, one at a time with rests in between. A large inbox takes
         a few days.
      </p>
   </div>
)
