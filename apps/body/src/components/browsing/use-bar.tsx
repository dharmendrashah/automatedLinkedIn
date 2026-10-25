import { cn } from '@/lib/utils'

import { NEAR_FULL_SHARE } from './overview'

// A thin bar of today's use against the account's own daily limit; amber from 85% on.
export const UseBar = ({
   usedSeconds,
   limitSeconds,
   className,
}: {
   usedSeconds: number
   limitSeconds: number
   className?: string
}) => {
   const share = limitSeconds > 0 ? usedSeconds / limitSeconds : 0

   return (
      <span className={cn('bg-muted block h-1 overflow-hidden rounded-full', className)} aria-hidden>
         <span
            className={cn('block h-full rounded-full', share >= NEAR_FULL_SHARE ? 'bg-warning' : 'bg-primary')}
            style={{ width: `${Math.min(100, Math.round(share * 100))}%` }}
         />
      </span>
   )
}
