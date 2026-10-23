import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef } from 'react'

import { ConversationRow } from './conversation-row'
import { type Index, type Row, otherAccountsOf } from './inbox'
import { ROW_HEIGHT } from './layout'
import { type Selection, isSelected } from './selection'

type Props = {
   rows: Row[]
   index: Index
   now: number
   activeId: string | undefined
   selection: Selection
   compact: boolean
   tokens: string[]
   onOpen: (id: string) => void
   onToggle: (id: string, range: boolean) => void
}

// The conversations as a listbox that draws only the rows in view, so ten thousand of them scroll like twenty. The focus stays on the
// list and names the open row (`aria-activedescendant`), so keys move through it without a focus of its own per row.
export const ConversationList = ({
   rows,
   index,
   now,
   activeId,
   selection,
   compact,
   tokens,
   onOpen,
   onToggle,
}: Props) => {
   const parent = useRef<HTMLDivElement>(null)
   const height = compact ? ROW_HEIGHT.compact : ROW_HEIGHT.comfortable
   // oxlint-disable-next-line react/incompatible-library -- the virtualizer's functions are not memoised, and none is passed on to a child
   const virtualizer = useVirtualizer({
      count: rows.length,
      getScrollElement: () => parent.current,
      estimateSize: () => height,
      overscan: 8,
   })
   const activeAt = rows.findIndex(row => row.conversation.id === activeId)
   const selecting = selection.all || selection.ids.size > 0

   useEffect(() => {
      if (activeAt >= 0) {
         virtualizer.scrollToIndex(activeAt, { align: 'auto' })
      }
   }, [activeAt, virtualizer])

   return (
      <div
         ref={parent}
         role="listbox"
         tabIndex={0}
         aria-label="Conversations"
         aria-multiselectable
         aria-activedescendant={activeId ? `row-${activeId}` : undefined}
         data-unibox-list
         className="h-full overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
         <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map(item => {
               const row = rows[item.index]

               if (!row) {
                  return null
               }

               return (
                  <div
                     key={row.conversation.id}
                     className="absolute top-0 left-0 w-full"
                     style={{ height: item.size, transform: `translateY(${item.start}px)` }}
                  >
                     <ConversationRow
                        row={row}
                        now={now}
                        active={row.conversation.id === activeId}
                        checked={isSelected(selection, row.conversation.id)}
                        selecting={selecting}
                        compact={compact}
                        tokens={tokens}
                        position={item.index + 1}
                        total={rows.length}
                        otherAccounts={otherAccountsOf(index, row.conversation).length}
                        onOpen={onOpen}
                        onToggle={onToggle}
                     />
                  </div>
               )
            })}
         </div>
      </div>
   )
}
