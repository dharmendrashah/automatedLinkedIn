import { Badge } from '@/components/ui/badge'
import { CheckCircle2, CircleHelp, Loader2, XCircle } from 'lucide-react'

import { cn } from '@/lib/utils'

import { type ResultTone, resultOf } from './describe'

const tones: Record<ResultTone, { icon: typeof CheckCircle2; className: string }> = {
   success: {
      icon: CheckCircle2,
      className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
   },
   failure: {
      icon: XCircle,
      className: 'bg-destructive/10 text-destructive',
   },
   running: {
      icon: Loader2,
      className: 'border-border text-muted-foreground',
   },
   unknown: {
      icon: CircleHelp,
      className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
   },
}

type Props = {
   status: Parameters<typeof resultOf>[0]['status']
   noAnswer: boolean
}

export const SessionStatusBadge = ({ status, noAnswer }: Props) => {
   const { label, tone } = resultOf({
      status,
      noAnswer,
   })
   const { icon: Icon, className } = tones[tone]

   return (
      <Badge variant="outline" className={cn('gap-1', className)}>
         <Icon className={cn(tone === 'running' && 'animate-spin')} />
         {label}
      </Badge>
   )
}
