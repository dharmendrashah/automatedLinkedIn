import { Textarea } from '@/components/ui/textarea'
import { type KeyboardEvent, type RefObject, useRef, useState } from 'react'

import { type Spot, spotOf } from './caret-position'
import { type Emoji, findEmoji, insertAt } from './emoji'
import { EMOJI_LIST_ID, emojiOptionId, triggerAt } from './emoji-trigger'
import { EmojiSuggest } from './emoji-suggest'
import { normaliseAddress, withAddress } from './link-text'
import { SelectionBar } from './selection-bar'
import { modKey } from './shortcuts'

type Props = {
   boxRef: RefObject<HTMLTextAreaElement | null>
   text: string
   // New text, and where the caret goes after it.
   onText: (value: string, caret?: number) => void
   // Sets the post's link; false when it was refused (the composer says why).
   onLink: (url: string) => boolean
   onEmojiPanel: () => void
   describedBy: string
}

type Anchor = {
   spot: Spot
   room: number
}

const MOD = typeof navigator === 'undefined' ? 'Ctrl' : modKey(navigator.platform)

// The text box with its two helpers: the emoji list that opens after a colon, and the bar over selected words. All keyboard handling
// of the box is here, so the rules for Enter, Tab and Escape are read in one place.
export const TextEditor = ({ boxRef, text, onText, onLink, onEmojiPanel, describedBy }: Props) => {
   const wrapper = useRef<HTMLDivElement>(null)
   const dragging = useRef(false)
   const [selection, setSelection] = useState({
      start: 0,
      end: 0,
   })
   const [anchor, setAnchor] = useState<Anchor>()
   const [choice, setChoice] = useState({
      query: '',
      index: 0,
   })
   const [dismissed, setDismissed] = useState<number>()
   const [composing, setComposing] = useState(false)
   const [bar, setBar] = useState<'off' | 'choose' | 'ask'>('off')

   const trigger = !composing && selection.start === selection.end ? triggerAt(text, selection.end) : undefined
   const items = trigger && trigger.start !== dismissed ? findEmoji(trigger.query) : []
   const active = trigger && choice.query === trigger.query ? choice.index : 0
   const listOpen = items.length > 0 && anchor !== undefined
   const selected = text.slice(selection.start, selection.end)

   const sync = (field: HTMLTextAreaElement) => {
      const { selectionStart: start, selectionEnd: end } = field

      setSelection({
         start,
         end,
      })
      setAnchor({
         spot: spotOf(field, start),
         room: field.clientWidth,
      })
      setBar(start !== end && field.value.slice(start, end).trim() !== '' && !dragging.current ? 'choose' : 'off')
   }

   const pickEmoji = (item: Emoji) => {
      if (trigger) {
         const next = insertAt(text, trigger.start, trigger.end, item.emoji)

         onText(next.value, next.caret)
      }
   }

   const finish = () => {
      setBar('off')
      boxRef.current?.focus()
   }

   const makeLink = (url: string) => {
      onLink(url)
      finish()
   }

   const addAddress = (url: string) => {
      if (onLink(url)) {
         const next = withAddress(text, selection.end, url)

         onText(next.value, next.caret)
      }

      finish()
   }

   // The shortcut: an address that is selected becomes the link at once; anything else asks for an address.
   const linkShortcut = (field: HTMLTextAreaElement) => {
      sync(field)

      const url = normaliseAddress(field.value.slice(field.selectionStart, field.selectionEnd))

      if (url) {
         makeLink(url)
      } else {
         setBar('ask')
      }
   }

   const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.nativeEvent.isComposing) {
         return
      }

      if (listOpen && trigger) {
         if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setChoice({
               query: trigger.query,
               index: (active + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length,
            })
         } else if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) {
            event.preventDefault()
            pickEmoji(items[active] as Emoji)
         } else if (event.key === 'Escape') {
            event.preventDefault()
            setDismissed(trigger.start)
         }

         return
      }

      const command = event.metaKey || event.ctrlKey

      if (command && event.key.toLowerCase() === 'k') {
         event.preventDefault()
         linkShortcut(event.currentTarget)
      } else if (command && event.shiftKey && event.key.toLowerCase() === 'e') {
         event.preventDefault()
         onEmojiPanel()
      } else if (event.key === 'Escape' && bar !== 'off') {
         setBar('off')
      }
   }

   // Words are being selected with the mouse: the bar waits until the button is let go.
   const startDrag = () => {
      dragging.current = true
      window.addEventListener(
         'pointerup',
         () => {
            dragging.current = false

            if (boxRef.current) {
               sync(boxRef.current)
            }
         },
         { once: true }
      )
   }

   return (
      <div
         ref={wrapper}
         className="relative"
         onBlur={event => {
            if (!wrapper.current?.contains(event.relatedTarget)) {
               setBar('off')
            }
         }}
      >
         <Textarea
            ref={boxRef}
            dir="auto"
            value={text}
            placeholder="What do you want to talk about?"
            aria-label="Text of the post"
            aria-describedby={describedBy}
            aria-autocomplete="list"
            aria-controls={listOpen ? EMOJI_LIST_ID : undefined}
            aria-activedescendant={listOpen ? emojiOptionId(active) : undefined}
            onChange={event => onText(event.target.value)}
            onSelect={event => sync(event.currentTarget)}
            onKeyDown={onKeyDown}
            onPointerDown={startDrag}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            className="max-h-[50vh] min-h-40 resize-none border-0 bg-transparent p-0 text-lg shadow-none focus-visible:ring-0 md:text-lg dark:bg-transparent"
         />

         {listOpen && anchor ? (
            <EmojiSuggest
               items={items}
               active={active}
               spot={anchor.spot}
               room={anchor.room}
               onPick={pickEmoji}
               onHover={index => trigger && setChoice({ query: trigger.query, index })}
            />
         ) : null}

         {bar !== 'off' && !listOpen && anchor ? (
            <SelectionBar
               key={bar === 'ask' ? 'ask' : selected}
               selected={selected}
               asking={bar === 'ask'}
               spot={anchor.spot}
               room={anchor.room}
               mod={MOD}
               onMakeLink={makeLink}
               onAddAddress={addAddress}
               onClose={finish}
            />
         ) : null}
      </div>
   )
}
