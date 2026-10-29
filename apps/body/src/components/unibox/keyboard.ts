export type Key = {
   key: string
   ctrlKey: boolean
   metaKey: boolean
   altKey: boolean
   shiftKey: boolean
}

export type Command =
   'NEXT' | 'PREVIOUS' | 'OPEN' | 'REPLY' | 'DONE' | 'UNREAD' | 'SELECT' | 'SEARCH' | 'COMPOSE' | 'HELP' | 'PALETTE'

const SINGLE: Record<string, Command> = {
   j: 'NEXT',
   ArrowDown: 'NEXT',
   k: 'PREVIOUS',
   ArrowUp: 'PREVIOUS',
   Enter: 'OPEN',
   r: 'REPLY',
   e: 'DONE',
   u: 'UNREAD',
   x: 'SELECT',
   c: 'COMPOSE',
   '/': 'SEARCH',
   '?': 'HELP',
}

// What a key press means to the Unibox. Single keys act only when no text box has the focus, so typing a reply never moves the
// list; Ctrl or Cmd K opens the palette anywhere; every other chord belongs to the browser.
export const commandFor = (event: Key, typing: boolean): Command | undefined => {
   const chord = event.ctrlKey || event.metaKey

   if (chord) {
      return event.key.toLowerCase() === 'k' && !event.altKey ? 'PALETTE' : undefined
   }

   if (typing || event.altKey) {
      return undefined
   }

   return SINGLE[event.key]
}

export type Target = {
   tagName: string
   isContentEditable: boolean
   role?: string | null
}

export const isTyping = (target: Target | null) =>
   target !== null &&
   (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName.toUpperCase()) ||
      target.isContentEditable ||
      target.role === 'textbox')

export type Open = {
   palette: boolean
   menu: boolean
   details: boolean
   composer: boolean
   selection: boolean
   // On a phone: the conversation is covering the list.
   thread: boolean
}

export type EscapeStep =
   'CLOSE_PALETTE' | 'CLOSE_MENU' | 'CLOSE_DETAILS' | 'LEAVE_COMPOSER' | 'CLEAR_SELECTION' | 'BACK'

// Escape closes one thing, the one on top, and never two at once.
export const escapeStep = (open: Open): EscapeStep | undefined => {
   if (open.palette) {
      return 'CLOSE_PALETTE'
   }

   if (open.menu) {
      return 'CLOSE_MENU'
   }

   if (open.details) {
      return 'CLOSE_DETAILS'
   }

   if (open.composer) {
      return 'LEAVE_COMPOSER'
   }

   if (open.selection) {
      return 'CLEAR_SELECTION'
   }

   return open.thread ? 'BACK' : undefined
}
