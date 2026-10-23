import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useState } from 'react'

import { fold } from './search'
import { type Selection, describeSelection } from './selection'

type BarProps = {
   selection: Selection
   visible: number
   matching: number
   onSelectAllMatching: () => void
   onRead: () => void
   onUnread: () => void
   onDone: () => void
   onClear: () => void
}

// What a bulk action is for, said in words with the count, and the actions themselves.
export const SelectionBar = ({
   selection,
   visible,
   matching,
   onSelectAllMatching,
   onRead,
   onUnread,
   onDone,
   onClear,
}: BarProps) => {
   const { label, canSelectAllMatching } = describeSelection(selection, visible, matching)

   return (
      <div
         role="toolbar"
         aria-label="Actions for the selected conversations"
         className="flex flex-wrap items-center gap-2 border-b bg-primary/10 px-3 py-1.5 text-sm"
      >
         <span className="font-medium" aria-live="polite">
            {label}
         </span>
         {canSelectAllMatching ? (
            <Button variant="link" size="xs" onClick={onSelectAllMatching}>
               Select all {matching.toLocaleString('en-US')} that match
            </Button>
         ) : null}
         <span className="ml-auto flex gap-1">
            <Button variant="outline" size="xs" onClick={onRead}>
               Mark read
            </Button>
            <Button variant="outline" size="xs" onClick={onUnread}>
               Mark unread
            </Button>
            <Button variant="outline" size="xs" onClick={onDone}>
               Done
            </Button>
            <Button variant="ghost" size="xs" onClick={onClear}>
               Clear
            </Button>
         </span>
      </div>
   )
}

export type PaletteItem = {
   id: string
   label: string
   hint?: string
   run: () => void
}

type PaletteProps = {
   open: boolean
   onOpenChange: (open: boolean) => void
   commands: PaletteItem[]
   findConversations: (query: string) => PaletteItem[]
   findAccounts: (query: string) => PaletteItem[]
}

// Ctrl or Cmd K: go to a conversation, show one account, or run a command, by typing a few letters.
export const Palette = ({ open, onOpenChange, commands, findConversations, findAccounts }: PaletteProps) => {
   const [query, setQuery] = useState('')
   const folded = fold(query).trim()
   const shownCommands = commands.filter(item => fold(item.label).includes(folded))
   const conversations = folded ? findConversations(folded) : []
   const accounts = folded ? findAccounts(folded) : []

   const run = (item: PaletteItem) => {
      onOpenChange(false)
      setQuery('')
      item.run()
   }

   const group = (heading: string, items: PaletteItem[]) =>
      items.length > 0 ? (
         <CommandGroup heading={heading}>
            {items.map(item => (
               <CommandItem key={item.id} value={item.id} onSelect={() => run(item)}>
                  <span className="truncate">{item.label}</span>
                  {item.hint ? (
                     <span className="ml-auto truncate text-xs text-muted-foreground">{item.hint}</span>
                  ) : null}
               </CommandItem>
            ))}
         </CommandGroup>
      ) : null

   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent
            className="top-[20%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg"
            showCloseButton={false}
         >
            <DialogTitle className="sr-only">Go to or do</DialogTitle>
            <DialogDescription className="sr-only">
               Type to find a conversation, an account or an action.
            </DialogDescription>
            <Command shouldFilter={false}>
               <CommandInput
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Find a conversation, an account or an action"
               />
               <CommandList>
                  <CommandEmpty>Nothing matches.</CommandEmpty>
                  {group('Conversations', conversations)}
                  {group('Accounts', accounts)}
                  {group('Actions', shownCommands)}
               </CommandList>
            </Command>
         </DialogContent>
      </Dialog>
   )
}
