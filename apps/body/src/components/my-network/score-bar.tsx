import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

import { type ScoreBand, scoreBandOf, scoreLabel } from './score'

// The band colour goes on the indicator; the variant selector beats the base `bg-primary`.
const BAR_COLOUR: Record<ScoreBand, string> = {
   RED: '[&>[data-slot=progress-indicator]]:bg-red-500',
   YELLOW: '[&>[data-slot=progress-indicator]]:bg-yellow-400',
   GREEN: '[&>[data-slot=progress-indicator]]:bg-green-500',
}

export const ScoreBar = ({ score }: { score: number | null }) => {
   if (score === null) return <span className="text-muted-foreground text-sm">No score</span>

   return (
      <span className="flex items-center gap-2" role="img" aria-label={scoreLabel(score)}>
         <Progress value={score} className={cn('w-20', BAR_COLOUR[scoreBandOf(score)])} />
         <span className="w-7 text-right text-sm tabular-nums">{score}</span>
      </span>
   )
}
