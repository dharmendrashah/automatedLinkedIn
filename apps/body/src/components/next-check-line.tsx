import { Clock } from 'lucide-react'

import { cn } from '@/lib/utils'

import { type Rhythm, nextCheckText } from '../lib/next-check'

type Props = {
   // The next automatic read of each account shown that is signed in (null when its time is not drawn yet).
   times: Array<string | null | undefined>
   rhythm: Rhythm
   // The time now, so the sentence follows the clock.
   now: Date
   className?: string
}

// A written line at the top of a page that says when its accounts are read next by themselves.
export const NextCheckLine = ({ times, rhythm, now, className }: Props) => (
   <p className={cn('text-muted-foreground flex items-center gap-2 text-sm', className)} role="status">
      <Clock className="size-4 shrink-0" aria-hidden />
      <span>{nextCheckText(times, now, rhythm)}</span>
   </p>
)
