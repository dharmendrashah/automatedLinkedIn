import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
   DropdownMenu,
   DropdownMenuCheckboxItem,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuRadioGroup,
   DropdownMenuRadioItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
   Check,
   CircleHelp,
   ListFilter,
   MailCheck,
   MoreHorizontal,
   RefreshCw,
   RotateCw,
   Search,
   SquarePen,
   Users,
   X,
} from 'lucide-react'
import { type ComponentProps, type RefObject, useState } from 'react'

import { type Sort, type View } from './types'

import { AccountPicker } from './account-picker'
import { viewLabel } from './views'

type Props = {
   query: string
   onQuery: (query: string) => void
   searchRef: RefObject<HTMLInputElement | null>
   picker: ComponentProps<typeof AccountPicker>
   accountLabel: string
   sort: Sort
   onSort: (sort: Sort) => void
   compact: boolean
   onCompact: (compact: boolean) => void
   needCount: number
   onGoToNeeds: () => void
   unreadCount: number
   onMarkAllRead: () => void
   shown: number
   total: number
   view: View
   onClearView: () => void
   onHelp: () => void
   // Read the messages again from LinkedIn, for the accounts shown; absent when there is nothing to read.
   onRefresh: (() => void) | undefined
   onReload: () => void
   // Opens the New message view; absent when a first message cannot be written from here.
   onCompose: (() => void) | undefined
   // The compose button and the search sit in the rail of views instead (a wide page).
   inRail: boolean
}

type ComposeProps = {
   onCompose: () => void
   // With its words, as the first thing of the rail; an icon in the toolbar.
   wide?: boolean
}

export const ComposeButton = ({ onCompose, wide = false }: ComposeProps) => (
   <Button
      size={wide ? 'default' : 'icon'}
      className={wide ? 'w-full justify-start' : 'shrink-0'}
      onClick={onCompose}
      title="New message (C)"
      aria-label={wide ? undefined : 'New message'}
   >
      <SquarePen />
      {wide ? 'New message' : null}
   </Button>
)

type SearchProps = {
   query: string
   onQuery: (query: string) => void
   searchRef: RefObject<HTMLInputElement | null>
}

export const SearchBox = ({ query, onQuery, searchRef }: SearchProps) => (
   <div className="relative min-w-0 flex-1">
      <Search
         className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
         aria-hidden
      />
      <Input
         ref={searchRef}
         type="search"
         value={query}
         onChange={event => onQuery(event.target.value)}
         placeholder="Search"
         aria-label="Search people, accounts and messages"
         className="h-9 pr-8 pl-8 [&::-webkit-search-cancel-button]:hidden"
      />
      {query ? (
         <button
            type="button"
            onClick={() => onQuery('')}
            aria-label="Clear the search"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm text-muted-foreground hover:text-foreground"
         >
            <X className="size-4" />
         </button>
      ) : (
         <kbd className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border bg-muted px-1 font-sans text-[10px] text-muted-foreground sm:block">
            /
         </kbd>
      )}
   </div>
)

// Search, the accounts shown, how the list is ordered, and the actions that apply to the whole list. What is filtered is always said,
// in words and with a way to clear it, so a list is never empty without a reason the owner can see.
export const Toolbar = ({
   query,
   onQuery,
   searchRef,
   picker,
   accountLabel,
   sort,
   onSort,
   compact,
   onCompact,
   needCount,
   onGoToNeeds,
   unreadCount,
   onMarkAllRead,
   shown,
   total,
   view,
   onClearView,
   onHelp,
   onRefresh,
   onReload,
   onCompose,
   inRail,
}: Props) => {
   const [confirm, setConfirm] = useState(false)
   const filteredAccounts = picker.selection !== undefined

   return (
      <div className="space-y-2 border-b bg-card px-3 py-2">
         <div className="flex items-center gap-2">
            {inRail ? null : (
               <>
                  {onCompose ? <ComposeButton onCompose={onCompose} /> : null}
                  <SearchBox query={query} onQuery={onQuery} searchRef={searchRef} />
               </>
            )}
            {inRail ? <span className="min-w-0 flex-1 truncate text-sm font-medium">{viewLabel(view)}</span> : null}
            <Popover>
               <PopoverTrigger asChild>
                  <Button variant={filteredAccounts ? 'secondary' : 'outline'} size="sm" className="max-w-48">
                     <Users />
                     <span className="truncate">{accountLabel}</span>
                  </Button>
               </PopoverTrigger>
               <PopoverContent align="end" className="w-80">
                  <AccountPicker {...picker} />
               </PopoverContent>
            </Popover>
            <DropdownMenu>
               <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                     <ListFilter />
                     <span className="hidden sm:inline">View</span>
                  </Button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Order</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={sort} onValueChange={value => onSort(value as Sort)}>
                     <DropdownMenuRadioItem value="NEWEST">Newest message first</DropdownMenuRadioItem>
                     <DropdownMenuRadioItem value="WAITING">Waiting longest first</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem checked={compact} onCheckedChange={onCompact}>
                     Compact rows
                  </DropdownMenuCheckboxItem>
               </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
               <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="More">
                     <MoreHorizontal />
                  </Button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="end">
                  <DropdownMenuItem disabled={unreadCount === 0} onSelect={() => setConfirm(true)}>
                     <MailCheck /> Mark all read
                  </DropdownMenuItem>
                  {onRefresh ? (
                     <DropdownMenuItem onSelect={onRefresh}>
                        <RefreshCw /> Read the messages again
                     </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem onSelect={onReload}>
                     <RotateCw /> Reload the list
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={onHelp}>
                     <CircleHelp /> Keyboard shortcuts
                  </DropdownMenuItem>
               </DropdownMenuContent>
            </DropdownMenu>
         </div>
         <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {needCount > 0 ? (
               <button
                  type="button"
                  onClick={onGoToNeeds}
                  title="Open the one that has waited longest"
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
               >
                  {needCount.toLocaleString('en-US')} need a reply
               </button>
            ) : (
               <span className="inline-flex items-center gap-1 text-success">
                  <Check className="size-3.5" aria-hidden /> Nothing waits for a reply
               </span>
            )}
            <span className="ml-auto" aria-live="polite">
               {shown === total
                  ? `${total.toLocaleString('en-US')} total`
                  : `Showing ${shown.toLocaleString('en-US')} of ${total.toLocaleString('en-US')}`}
            </span>
            {view === 'ALL' ? null : (
               <button
                  type="button"
                  onClick={onClearView}
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-px hover:bg-accent"
               >
                  {viewLabel(view)} <X className="size-3" aria-hidden />
               </button>
            )}
         </div>
         <AlertDialog open={confirm} onOpenChange={setConfirm}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Mark {unreadCount.toLocaleString('en-US')} as read?</AlertDialogTitle>
                  <AlertDialogDescription>
                     This marks the unread conversations in the accounts you are looking at as read. It does not reply
                     to them, and you can undo it right after.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onMarkAllRead}>Mark as read</AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </div>
   )
}
