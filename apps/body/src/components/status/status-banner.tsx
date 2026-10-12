import { CheckCircle2, CircleHelp, XCircle } from 'lucide-react'

import { cn } from '@/lib/utils'

import { type ModuleState } from './types'

const looks: Record<ModuleState, { icon: typeof CheckCircle2; className: string }> = {
   live: {
      icon: CheckCircle2,
      className: 'border-emerald-500/30 bg-emerald-500/5',
   },
   dead: {
      icon: XCircle,
      className: 'border-destructive/30 bg-destructive/5',
   },
   unknown: {
      icon: CircleHelp,
      className: 'border-amber-500/30 bg-amber-500/5',
   },
}

type Props = {
   state: ModuleState
   title: string
   detail?: string
}

// The one-line answer to "is everything working?".
export const StatusBanner = ({ state, title, detail }: Props) => {
   const { icon: Icon, className } = looks[state]

   return (
      <div role="status" className={cn('flex gap-3 rounded-xl border p-4', className)}>
         <Icon className="mt-0.5 size-5 shrink-0" />
         <div className="grid gap-1">
            <p className="text-sm font-medium">{title}</p>
            {detail ? <p className="text-muted-foreground text-sm">{detail}</p> : null}
         </div>
      </div>
   )
}
