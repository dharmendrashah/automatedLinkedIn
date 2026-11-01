import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import { type KeyboardEvent, useState } from 'react'

import { cn } from '@/lib/utils'

import { type Block } from './types'

import { BLOCK_ICONS, GROUPS, tileOf } from './block-look'
import { choicesFor } from './graph-convert'

type Props = {
   open: boolean
   catalog: Block[]
   // The block the new one is added next to, or null for a free block; `before` when the new block feeds it.
   after: Block | null
   before?: boolean
   onPick: (block: Block) => void
   onClose: () => void
}

const Choices = ({ catalog, after, before, onPick }: Omit<Props, 'open' | 'onClose'>) => {
   const [query, setQuery] = useState('')
   const [active, setActive] = useState(0)
   const choices = choicesFor(catalog, after, query, before)
   const ordered = GROUPS.flatMap(({ group }) => choices.filter(block => block.group === group))
   const current = Math.min(active, ordered.length - 1)

   const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
         event.preventDefault()
         setActive((current + (event.key === 'ArrowDown' ? 1 : ordered.length - 1)) % Math.max(ordered.length, 1))
      } else if (event.key === 'Enter' && ordered[current]) {
         event.preventDefault()
         onPick(ordered[current])
      }
   }

   return (
      <div className="grid gap-3" onKeyDown={onKeyDown}>
         <div className="relative">
            <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" aria-hidden />
            <Input
               autoFocus
               aria-label="Search blocks"
               placeholder="Search blocks…"
               className="pl-8"
               value={query}
               onChange={event => {
                  setQuery(event.target.value)
                  setActive(0)
               }}
            />
         </div>
         <div className="grid max-h-[60vh] gap-3 overflow-y-auto" role="listbox" aria-label="Blocks">
            {ordered.length === 0 ? (
               <p className="text-muted-foreground p-4 text-center text-sm">No block fits here.</p>
            ) : null}
            {GROUPS.map(({ group, emoji }) => {
               const inGroup = ordered.filter(block => block.group === group)

               return inGroup.length > 0 ? (
                  <div key={group} className="grid gap-1">
                     <p className="text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase">
                        <span aria-hidden>{emoji}</span> {group}
                     </p>
                     {inGroup.map(block => {
                        const Icon = BLOCK_ICONS[block.type]
                        const isActive = ordered[current]?.type === block.type

                        return (
                           <button
                              key={block.type}
                              type="button"
                              role="option"
                              aria-selected={isActive}
                              onMouseEnter={() => setActive(ordered.indexOf(block))}
                              onClick={() => onPick(block)}
                              className={cn(
                                 'flex items-start gap-3 rounded-lg p-2 text-left',
                                 isActive ? 'bg-muted' : 'hover:bg-muted/60'
                              )}
                           >
                              <span className={cn('grid size-8 shrink-0 place-items-center rounded-md', tileOf(group))}>
                                 <Icon className="size-4" aria-hidden />
                              </span>
                              <span className="grid">
                                 <span className="text-sm font-medium">{block.label}</span>
                                 <span className="text-muted-foreground text-xs">{block.summary}</span>
                              </span>
                           </button>
                        )
                     })}
                  </div>
               ) : null
            })}
         </div>
      </div>
   )
}

// Search the blocks and pick one; arrows and Enter work from the search box.
export const BlockPicker = ({ open, catalog, after, before, onPick, onClose }: Props) => (
   <Dialog open={open} onOpenChange={next => (next ? undefined : onClose())}>
      <DialogContent className="sm:max-w-xl">
         <DialogHeader>
            <DialogTitle>{after ? `Add ${before ? 'before' : 'after'} "${after.label}"` : 'Add a block'}</DialogTitle>
            <DialogDescription>Type to search. Use the arrow keys and Enter to pick.</DialogDescription>
         </DialogHeader>
         {open ? <Choices catalog={catalog} after={after} before={before} onPick={onPick} /> : null}
      </DialogContent>
   </Dialog>
)
