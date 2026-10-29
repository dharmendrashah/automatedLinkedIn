import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Inbox, Info, SearchX } from 'lucide-react'

import { type View } from './types'

// What the list says when it holds nothing, and why: a filter, a search, an empty view, or really no messages. Always with the way out.
export const EmptyList = ({
   view,
   query,
   accountsFiltered,
   total,
   onClearSearch,
   onClearAccounts,
   onAll,
   onRefresh,
}: {
   view: View
   query: string
   accountsFiltered: boolean
   total: number
   onClearSearch: () => void
   onClearAccounts: () => void
   onAll: () => void
   onRefresh: (() => void) | undefined
}) => {
   if (total === 0) {
      return (
         <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <Inbox className="size-10 text-muted-foreground" aria-hidden />
            <p className="font-medium">No messages yet</p>
            <p className="max-w-xs text-sm text-muted-foreground">
               When your accounts get messages, or you write first, they are listed here, all in one place.
            </p>
            {onRefresh ? (
               <Button size="sm" onClick={onRefresh}>
                  Read the messages now
               </Button>
            ) : null}
         </div>
      )
   }

   const reasons = [
      query ? `the search "${query}"` : '',
      accountsFiltered ? 'the accounts picked' : '',
      view === 'ALL' ? '' : 'this view',
   ].filter(Boolean)

   return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
         <SearchX className="size-10 text-muted-foreground" aria-hidden />
         <p className="font-medium">
            {view === 'NEEDS_REPLY' && reasons.length === 1 ? 'Nothing waits for a reply' : 'No conversation matches'}
         </p>
         <p className="max-w-xs text-sm text-muted-foreground">Left out by {reasons.join(' and ')}.</p>
         <div className="flex flex-wrap justify-center gap-2">
            {query ? (
               <Button variant="outline" size="sm" onClick={onClearSearch}>
                  Clear the search
               </Button>
            ) : null}
            {accountsFiltered ? (
               <Button variant="outline" size="sm" onClick={onClearAccounts}>
                  Show all accounts
               </Button>
            ) : null}
            {view === 'ALL' ? null : (
               <Button variant="outline" size="sm" onClick={onAll}>
                  Show all
               </Button>
            )}
         </div>
      </div>
   )
}

export const NoConversation = ({ needCount }: { needCount: number }) => (
   <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
      <Inbox className="size-12" aria-hidden />
      <p className="font-medium text-foreground">Pick a conversation</p>
      <p className="text-sm">
         {needCount > 0
            ? `${needCount.toLocaleString('en-US')} wait for a reply. Press J to start.`
            : 'Nothing waits for a reply.'}
      </p>
   </div>
)

export const SampleBanner = () => (
   <p
      role="note"
      className="flex items-center justify-center gap-1.5 border-b bg-muted/60 px-3 py-1 text-xs text-muted-foreground"
   >
      <Info className="size-3.5 shrink-0" aria-hidden />
      Example messages. Nothing is sent.
   </p>
)

const SHORTCUTS: [string, string][] = [
   ['J or Down', 'Next conversation'],
   ['K or Up', 'Previous conversation'],
   ['Enter', 'Open the conversation'],
   ['R', 'Reply'],
   ['C', 'Write a new message to a connection'],
   ['E', 'Done, and go to the next that needs a reply'],
   ['U', 'Mark unread'],
   ['X', 'Select the conversation'],
   ['/', 'Search'],
   ['Ctrl or Cmd K', 'Go to or do anything'],
   ['Ctrl or Cmd Enter', 'Send the reply'],
   ['Esc', 'Close the top thing, then leave the reply, then go back'],
   ['?', 'This list'],
]

export const HelpDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => (
   <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
         <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>Single keys work when no text box has the focus.</DialogDescription>
         </DialogHeader>
         <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            {SHORTCUTS.map(([keys, what]) => (
               <div key={keys} className="contents">
                  <dt>
                     <kbd className="rounded border bg-muted px-1.5 py-0.5 font-sans text-xs">{keys}</kbd>
                  </dt>
                  <dd className="text-muted-foreground">{what}</dd>
               </div>
            ))}
         </dl>
      </DialogContent>
   </Dialog>
)
