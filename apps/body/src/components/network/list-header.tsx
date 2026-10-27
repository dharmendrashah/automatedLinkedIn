import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

type Props = {
   // The first column is a "choose all" only on the Waiting view.
   selectable: boolean
   chosenCount: number
   // How many can be chosen at once now: the run's share, or fewer when the list or the day is shorter.
   room: number
   text: string
   usage: string
   // Why no more can be chosen, once the limit is reached.
   limit: string | undefined
   onToggleAll: () => void
   onClear: () => void
   onAccept: () => void
   onIgnore: () => void
}

// The line above the list. It counts what is shown and offers "choose all"; once requests are chosen, it turns into the place
// where they are answered together.
export const ListHeader = ({
   selectable,
   chosenCount,
   room,
   text,
   usage,
   limit,
   onToggleAll,
   onClear,
   onAccept,
   onIgnore,
}: Props) => (
   <div className="bg-muted/30 flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-sm">
      {selectable ? (
         <Checkbox
            checked={chosenCount === 0 ? false : chosenCount >= room ? true : 'indeterminate'}
            disabled={room === 0 && chosenCount === 0}
            onCheckedChange={onToggleAll}
            aria-label={chosenCount > 0 ? 'Clear the choice' : `Choose up to ${room}`}
            title={chosenCount > 0 ? 'Clear the choice' : `Choose the first ${room}`}
         />
      ) : (
         <span className="size-4" aria-hidden />
      )}
      {chosenCount === 0 ? (
         <span className="text-muted-foreground">{text}</span>
      ) : (
         <>
            <span className="font-medium">{chosenCount} chosen</span>
            {limit ? <span className="text-muted-foreground text-xs">{limit}</span> : null}
            <Button variant="ghost" size="sm" onClick={onClear}>
               Clear
            </Button>
         </>
      )}
      <div className="ml-auto flex items-center gap-2">
         {chosenCount > 0 ? (
            <>
               <Button variant="outline" size="sm" onClick={onIgnore}>
                  Ignore {chosenCount}
               </Button>
               <Button size="sm" onClick={onAccept}>
                  Accept {chosenCount}
               </Button>
            </>
         ) : (
            <span className="text-muted-foreground text-xs">{usage}</span>
         )}
      </div>
   </div>
)
