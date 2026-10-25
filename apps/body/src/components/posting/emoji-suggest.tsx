import { cn } from '@/lib/utils'

import type { Emoji } from './emoji'
import type { Spot } from './caret-position'
import { EMOJI_LIST_ID, emojiOptionId } from './emoji-trigger'

type Props = {
   items: Emoji[]
   active: number
   spot: Spot
   // The width of the box it sits in, so the list stays inside it.
   room: number
   onPick: (item: Emoji) => void
   onHover: (index: number) => void
}

const WIDTH = 256

// The emoji that match what was typed after a colon, under the caret. The text box keeps the focus: it points at the marked option
// with `aria-activedescendant`, so the keyboard and a screen reader work from where the person is typing.
export const EmojiSuggest = ({ items, active, spot, room, onPick, onHover }: Props) => (
   <div
      className="bg-popover text-popover-foreground absolute z-20 overflow-hidden rounded-md border shadow-md"
      style={{
         top: spot.top + spot.height + 4,
         left: Math.max(0, Math.min(spot.left, room - WIDTH)),
         width: WIDTH,
      }}
   >
      <ul id={EMOJI_LIST_ID} role="listbox" aria-label="Emoji" className="max-h-64 overflow-y-auto py-1">
         {items.map((item, index) => (
            <li
               key={item.name}
               id={emojiOptionId(index)}
               role="option"
               aria-selected={index === active}
               // Mouse down would take the focus from the text box before the click lands.
               onMouseDown={event => event.preventDefault()}
               onClick={() => onPick(item)}
               onMouseMove={() => onHover(index)}
               className={cn(
                  'flex cursor-pointer items-center gap-3 px-3 py-1.5 text-sm',
                  index === active && 'bg-accent text-accent-foreground'
               )}
            >
               <span aria-hidden className="text-lg">
                  {item.emoji}
               </span>
               <span>:{item.name}:</span>
            </li>
         ))}
      </ul>
      <p className="text-muted-foreground border-t px-3 py-1 text-[11px]" aria-live="polite">
         {items.length === 1 ? '1 emoji' : `${items.length} emoji`} · ↑ ↓ to move · Enter to insert · Esc to close
      </p>
   </div>
)
