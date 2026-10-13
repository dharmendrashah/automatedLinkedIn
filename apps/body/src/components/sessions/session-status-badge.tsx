import { Badge } from '@/components/ui/badge'
import { CheckCircle2, CircleHelp, Loader2, XCircle } from 'lucide-react'

import { cn } from '@/lib/utils'

import { type ResultTone, resultOf } from './describe'
import { useTaskCatalog } from './use-task-catalog'

const tones: Record<ResultTone, { icon: typeof CheckCircle2; className: string }> = {
   success: {
      icon: CheckCircle2,
      className: 'bg-success/10 text-success',
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
      className: 'bg-warning/10 text-warning',
   },
   neutral: {
      icon: CircleHelp,
      className: 'bg-muted text-muted-foreground',
   },
}

type Props = {
   status: Parameters<typeof resultOf>[0]['status']
   noAnswer: boolean
   kind?: Parameters<typeof resultOf>[0]['kind']
   task?: string | null
   verdict?: string | null
}

export const SessionStatusBadge = ({ status, noAnswer, kind, task, verdict }: Props) => {
   const catalog = useTaskCatalog()
   const { label, tone } = resultOf(
      {
         status,
         noAnswer,
         kind,
         task,
         verdict,
      },
      catalog
   )
   const { icon: Icon, className } = tones[tone]

   return (
      <Badge variant="outline" className={cn('gap-1', className)}>
         <Icon className={cn(tone === 'running' && 'animate-spin')} />
         {label}
      </Badge>
   )
}
