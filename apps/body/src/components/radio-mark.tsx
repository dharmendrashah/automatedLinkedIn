import { cn } from '@/lib/utils'

// The round mark of a choice card, filled when the card is the chosen one.
export const RadioMark = ({ checked }: { checked: boolean }) => (
   <span
      aria-hidden
      className={cn(
         'grid size-4 shrink-0 place-items-center rounded-full border transition-colors',
         checked ? 'border-primary' : 'border-muted-foreground/30'
      )}
   >
      {checked ? <span className="bg-primary size-2 rounded-full" /> : null}
   </span>
)
