import { Badge } from '@/components/ui/badge'
import { tone } from '@/lib/tone'

import { cn } from '@/lib/utils'

import { type HealthLevel, levelInfo } from './health'

// The overall health as a pill: icon, colour and word together, so it reads without the colour.
export const HealthBadge = ({ level, className }: { level: HealthLevel; className?: string }) => {
   const { label, tone: levelTone, icon: Icon } = levelInfo[level]

   return (
      <Badge variant="outline" className={cn('gap-1.5 py-1', tone[levelTone].badge, className)}>
         <Icon className={cn(level === 'CHECKING' && 'animate-spin')} aria-hidden />
         {label}
      </Badge>
   )
}
