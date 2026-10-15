import { type RouterInputs } from '../../trpc'

export type TakeoverInput = RouterInputs['takeover']['send']['input']

type KeyName = Extract<TakeoverInput, { kind: 'key' }>['key']

const KEYS: readonly KeyName[] = [
   'Enter',
   'Tab',
   'Backspace',
   'Delete',
   'Escape',
   'ArrowUp',
   'ArrowDown',
   'ArrowLeft',
   'ArrowRight',
]

const isKeyName = (key: string): key is KeyName => (KEYS as readonly string[]).includes(key)

// The most one input may carry; brain refuses more.
const MAX_TEXT = 200

type Rect = { left: number; top: number; width: number; height: number }

const clamp = (value: number) => Math.min(1, Math.max(0, value))

// Where a click was on the picture, as a fraction of it: the page behind is not the size of the owner's screen.
export const clickFraction = ({ clientX, clientY }: { clientX: number; clientY: number }, rect: Rect) => {
   if (rect.width <= 0 || rect.height <= 0) {
      return undefined
   }

   return {
      x: clamp((clientX - rect.left) / rect.width),
      y: clamp((clientY - rect.top) / rect.height),
   }
}

// What a key press does in the page. Shortcuts and keys outside the list stay with the owner's own browser.
export const keyInput = ({
   key,
   ctrlKey,
   metaKey,
   altKey,
}: {
   key: string
   ctrlKey: boolean
   metaKey: boolean
   altKey: boolean
}): TakeoverInput | undefined => {
   if (ctrlKey || metaKey || altKey) {
      return undefined
   }

   if (isKeyName(key)) {
      return {
         kind: 'key',
         key,
      }
   }

   return [...key].length === 1
      ? {
           kind: 'type',
           text: key,
        }
      : undefined
}

// Typed characters wait here a moment and go as one input.
export class TypingBuffer {
   private text = ''

   public add(character: string) {
      this.text += character
   }

   public take(): TakeoverInput | undefined {
      if (this.text === '') {
         return undefined
      }

      const text = this.text.slice(0, MAX_TEXT)

      this.text = this.text.slice(MAX_TEXT)

      return {
         kind: 'type',
         text,
      }
   }

   public get pending() {
      return this.text !== ''
   }
}
