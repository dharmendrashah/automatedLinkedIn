import { type Direction } from './layout'

export type Shortcut =
   | { action: 'add' | 'open' | 'remove' | 'close' | 'save' | 'undo' | 'redo' | 'duplicate' }
   | { action: 'move'; direction: Direction }

type Key = {
   key: string
   metaKey: boolean
   ctrlKey: boolean
   shiftKey: boolean
   target: EventTarget | null
}

const ARROWS: Record<string, Direction> = {
   ArrowUp: 'up',
   ArrowDown: 'down',
   ArrowLeft: 'left',
   ArrowRight: 'right',
}

// Typing in a field, or anything in an open dialog, is never a canvas shortcut.
const isTyping = (target: EventTarget | null) =>
   typeof HTMLElement !== 'undefined' &&
   target instanceof HTMLElement &&
   (target.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
      target.closest('[role="dialog"]') !== null)

export const shortcutOf = (event: Key): Shortcut | null => {
   if (isTyping(event.target)) {
      return null
   }

   const command = event.metaKey || event.ctrlKey
   const key = event.key.toLowerCase()

   if (command) {
      if (key === 's') return { action: 'save' }
      if (key === 'z') return { action: event.shiftKey ? 'redo' : 'undo' }
      if (key === 'y') return { action: 'redo' }
      if (key === 'd') return { action: 'duplicate' }

      return null
   }

   if (event.key in ARROWS) {
      return {
         action: 'move',
         direction: ARROWS[event.key],
      }
   }

   const plain: Record<string, Shortcut['action']> = {
      Tab: 'add',
      Enter: 'open',
      Delete: 'remove',
      Backspace: 'remove',
      Escape: 'close',
   }
   const action = plain[event.key]

   return action && action !== 'move' ? { action } : null
}

export const SHORTCUT_HELP = [
   ['Tab', 'Add a block'],
   ['Enter or double-click', 'Open the block’s settings'],
   ['Delete or Backspace', 'Remove the selected block or line'],
   ['Arrow keys', 'Select the next block'],
   ['Ctrl/⌘ + D', 'Duplicate the block'],
   ['Ctrl/⌘ + Z', 'Undo'],
   ['Ctrl/⌘ + Shift + Z', 'Redo'],
   ['Ctrl/⌘ + S', 'Save changes'],
   ['Esc', 'Clear the selection, then leave full screen'],
] as const
