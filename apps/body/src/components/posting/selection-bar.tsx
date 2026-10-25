import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Link2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { Spot } from './caret-position'
import { addressProblem, normaliseAddress } from './link-text'

type Props = {
   // What is selected; empty when the bar was opened at the caret.
   selected: string
   // Open on the address field at once (the shortcut), instead of the choice of actions.
   asking: boolean
   spot: Spot
   room: number
   mod: string
   onMakeLink: (url: string) => void
   onAddAddress: (url: string) => void
   onClose: () => void
}

const WIDTH = 340

// A small bar over the selected words, as in a text editor. An address can be made the post's link at once; other words can be given
// an address, which is written after them and also becomes the post's link, because LinkedIn has no clickable words inside text.
export const SelectionBar = ({ selected, asking, spot, room, mod, onMakeLink, onAddAddress, onClose }: Props) => {
   const [typing, setTyping] = useState(asking)
   const [url, setUrl] = useState('')
   const field = useRef<HTMLInputElement>(null)
   const address = normaliseAddress(selected)
   const problem = addressProblem(url)
   const style = {
      top: Math.max(0, spot.top - 48),
      left: Math.max(0, Math.min(spot.left, room - WIDTH)),
   }

   useEffect(() => {
      if (typing) {
         field.current?.focus()
      }
   }, [typing])

   return (
      <div
         role="toolbar"
         aria-label="Link"
         className="bg-popover text-popover-foreground absolute z-20 flex items-center gap-2 rounded-md border p-1.5 shadow-md"
         style={style}
         // A click on the bar must not take the focus and the selection from the text box, except into the address field.
         onMouseDown={event => {
            if (!(event.target instanceof HTMLInputElement)) {
               event.preventDefault()
            }
         }}
         onKeyDown={event => {
            if (event.key === 'Escape') {
               event.preventDefault()
               onClose()
            }
         }}
      >
         {typing ? (
            <form
               className="flex items-center gap-2"
               onSubmit={event => {
                  event.preventDefault()

                  const checked = normaliseAddress(url)

                  if (checked) {
                     onAddAddress(checked)
                  }
               }}
            >
               <Input
                  value={url}
                  onChange={event => setUrl(event.target.value)}
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  placeholder="https://example.com"
                  aria-label="Address of the link"
                  aria-invalid={Boolean(problem)}
                  aria-describedby="link-bar-problem"
                  className="h-8 w-56"
                  ref={field}
               />
               <Button type="submit" size="sm" className="h-8" disabled={!normaliseAddress(url)}>
                  Add
               </Button>
               {problem ? (
                  <span
                     id="link-bar-problem"
                     role="alert"
                     className="bg-popover text-destructive absolute top-full left-0 mt-1 rounded border px-2 py-1 text-xs"
                  >
                     {problem}
                  </span>
               ) : null}
            </form>
         ) : (
            <>
               {address ? (
                  <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => onMakeLink(address)}>
                     <Link2 />
                     Make it a link
                  </Button>
               ) : (
                  <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setTyping(true)}>
                     <Link2 />
                     Add a URL
                  </Button>
               )}
               <kbd className="text-muted-foreground rounded border px-1.5 py-0.5 text-[11px]">{mod} K</kbd>
            </>
         )}
      </div>
   )
}
