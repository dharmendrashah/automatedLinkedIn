import { Button } from '@/components/ui/button'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

import { useRotatingCode } from './use-rotating-code'

type Props = {
   // Undefined until revealed; the caller clears it on hide so the key leaves memory.
   secret: string | undefined
   revealing: boolean
   onShow: () => void
   onHide: () => void
}

// The live code of a revealed two-step key, like an authenticator app, with a countdown to the next one.
export const TotpCode = ({ secret, revealing, onShow, onHide }: Props) => {
   const { code, secondsLeft } = useRotatingCode(secret)

   if (revealing) {
      return <Loader2 className="text-muted-foreground size-4 animate-spin" />
   }

   if (!secret || !code) {
      return (
         <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={onShow}>
            <Eye className="size-3.5" />
            Show code
         </Button>
      )
   }

   return (
      <div className="flex items-center gap-2">
         <span className="font-mono text-sm tabular-nums" aria-live="polite">
            {code.slice(0, 3)} {code.slice(3)}
         </span>
         <span className="text-muted-foreground w-4 text-right text-xs tabular-nums">{secondsLeft}</span>
         <Button variant="ghost" size="icon" className="size-6" aria-label="Hide the two-step code" onClick={onHide}>
            <EyeOff className="size-3.5" />
         </Button>
      </div>
   )
}
