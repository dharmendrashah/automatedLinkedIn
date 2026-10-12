import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle2, CircleHelp, XCircle } from 'lucide-react'

import { cn } from '@/lib/utils'

import { type ModuleState, type ModuleStatus } from './types'

import { stateLabel } from './describe'

const states: Record<ModuleState, { icon: typeof CheckCircle2; className: string }> = {
   live: {
      icon: CheckCircle2,
      className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
   },
   dead: {
      icon: XCircle,
      className: 'bg-destructive/10 text-destructive',
   },
   unknown: {
      icon: CircleHelp,
      className: 'bg-muted text-muted-foreground',
   },
}

const StateBadge = ({ state }: { state: ModuleState }) => {
   const { icon: Icon, className } = states[state]

   return (
      <Badge variant="outline" className={cn('gap-1', className)}>
         <Icon />
         {stateLabel(state)}
      </Badge>
   )
}

export const StatusCard = ({ module }: { module: ModuleStatus }) => (
   <Card className="py-0">
      <CardContent className="flex items-start justify-between gap-3 p-4">
         <div className="grid min-w-0 gap-1">
            <h4 className="text-sm font-medium">{module.name}</h4>
            <p className="text-muted-foreground text-xs">{module.description}</p>
            {module.reason ? (
               <p className={cn('text-xs font-medium', module.status === 'dead' && 'text-destructive')}>
                  {module.reason}
               </p>
            ) : null}
         </div>
         <StateBadge state={module.status} />
      </CardContent>
   </Card>
)
