import { tone } from '@/lib/tone'

import { cn } from '@/lib/utils'

import { type Check } from './checks'

// One of the four checks: what it is, the result in a word with its icon and colour, and why.
export const CheckChip = ({ check, showAbout = false }: { check: Check; showAbout?: boolean }) => {
   const colours = tone[check.tone]

   return (
      <div className={cn('flex gap-3 rounded-lg border p-3', colours.panel)}>
         <check.icon className={cn('mt-0.5 size-4 shrink-0', colours.text)} aria-hidden />
         <div className="grid min-w-0 gap-0.5">
            <p className="text-muted-foreground text-xs font-medium">{check.title}</p>
            <p className={cn('flex items-center gap-1.5 text-sm font-semibold', colours.text)}>
               <check.stateIcon
                  className={cn('size-3.5 shrink-0', check.tone === 'info' && 'animate-spin')}
                  aria-hidden
               />
               {check.result}
            </p>
            <p className="text-muted-foreground text-xs leading-relaxed">{check.reason}</p>
            {showAbout ? <p className="text-muted-foreground/80 mt-1 text-xs leading-relaxed">{check.about}</p> : null}
         </div>
      </div>
   )
}
