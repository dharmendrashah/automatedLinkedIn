import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Loader2 } from 'lucide-react'
import { type ReactNode } from 'react'

type Props = {
   label: string
   icon: ReactNode
   // Why the button cannot be pressed, shown on hover; undefined when it can.
   blocker: string | undefined
   busy: boolean
   onClick: () => void
}

// A row's own button to start a spider task by hand. A disabled button gets no pointer events, so the span carries the tip.
export const TestButton = ({ label, icon, blocker, busy, onClick }: Props) => {
   const button = (
      <Button variant="outline" size="sm" disabled={Boolean(blocker) || busy} onClick={onClick}>
         {busy ? <Loader2 className="animate-spin" /> : icon}
         {label}
      </Button>
   )

   if (!blocker) {
      return button
   }

   return (
      <Tooltip>
         <TooltipTrigger asChild>
            <span tabIndex={0}>{button}</span>
         </TooltipTrigger>
         <TooltipContent className="max-w-xs">{blocker}</TooltipContent>
      </Tooltip>
   )
}
