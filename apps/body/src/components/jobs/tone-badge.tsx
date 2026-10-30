import { Badge } from '@/components/ui/badge'
import { type Tone, tone } from '@/lib/tone'
import { AlertTriangle, CheckCircle2, CircleHelp, XCircle } from 'lucide-react'
import { type ReactNode } from 'react'

import { cn } from '@/lib/utils'

// A tone is always an icon and a word as well as a colour.
const ICONS: Record<Tone, typeof CheckCircle2> = {
   success: CheckCircle2,
   warning: AlertTriangle,
   danger: XCircle,
   info: CircleHelp,
   neutral: CircleHelp,
}

export const ToneBadge = ({ tone: name, children }: { tone: Tone; children: ReactNode }) => {
   const Icon = ICONS[name]

   return (
      <Badge variant="outline" className={cn('gap-1', tone[name].badge)}>
         <Icon />
         {children}
      </Badge>
   )
}
