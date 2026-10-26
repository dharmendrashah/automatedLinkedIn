// The command key on Apple machines, Ctrl everywhere else.
export const modKey = (platform: string | undefined) => (/mac|iphone|ipad/i.test(platform ?? '') ? '⌘' : 'Ctrl')

// What the composer answers to, as the help lists it.
export const SHORTCUTS = (mod: string) => [
   {
      keys: [':', 'a name'],
      does: 'Type a colon and the start of a name, such as :rocket, to pick an emoji',
   },
   {
      keys: ['↑', '↓'],
      does: 'Move through the emoji list',
   },
   {
      keys: ['Enter', 'Tab'],
      does: 'Insert the emoji that is marked',
   },
   {
      keys: [mod, 'K'],
      does: 'Add a link for the selected words, or at the caret',
   },
   {
      keys: [mod, 'Shift', 'E'],
      does: 'Open the emoji panel',
   },
   {
      keys: ['Esc'],
      does: 'Close a list or the link bar',
   },
]
