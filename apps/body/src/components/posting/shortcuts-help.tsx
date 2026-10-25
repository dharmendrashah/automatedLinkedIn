import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Keyboard } from 'lucide-react'

import { SHORTCUTS } from './shortcuts'

// The shortcuts of the composer, listed once so nobody has to guess them.
export const ShortcutsHelp = ({ mod }: { mod: string }) => (
   <Popover>
      <PopoverTrigger asChild>
         <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Keyboard shortcuts">
            <Keyboard />
         </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
         <h3 className="mb-2 text-sm font-medium">Shortcuts</h3>
         <dl className="grid gap-2">
            {SHORTCUTS(mod).map(({ keys, does }) => (
               <div key={does} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 text-xs">
                  <dt className="flex flex-wrap gap-1">
                     {keys.map(key => (
                        <kbd key={key} className="bg-muted rounded border px-1.5 py-0.5 font-sans">
                           {key}
                        </kbd>
                     ))}
                  </dt>
                  <dd className="text-muted-foreground">{does}</dd>
               </div>
            ))}
         </dl>
      </PopoverContent>
   </Popover>
)
