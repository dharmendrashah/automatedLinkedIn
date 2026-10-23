import { Checkbox } from '@/components/ui/checkbox'
import { Users } from 'lucide-react'
import { memo } from 'react'

import { cn } from '@/lib/utils'

import { AvatarPair } from './account-avatar'
import { AccountChip } from './account-chip'
import { type Row } from './inbox'
import { Marked } from './rich-text'
import { lastReplyAt } from './status'
import { StatusChip } from './status-chip'
import { formatListTime } from './time'

type Props = {
   row: Row
   now: number
   active: boolean
   checked: boolean
   selecting: boolean
   compact: boolean
   tokens: string[]
   position: number
   total: number
   otherAccounts: number
   onOpen: (id: string) => void
   onToggle: (id: string, range: boolean) => void
}

// One conversation in the list, in two lines (one when compact): who, when, the last words, and the account it is with, the way
// it stands and what else is worth knowing. Nothing here changes state except through the two callbacks.
const ConversationRowView = ({
   row,
   now,
   active,
   checked,
   selecting,
   compact,
   tokens,
   position,
   total,
   otherAccounts,
   onOpen,
   onToggle,
}: Props) => {
   const { conversation, account, status, preview } = row
   const unread = conversation.unread

   return (
      <div
         id={`row-${conversation.id}`}
         role="option"
         aria-selected={active}
         aria-posinset={position}
         aria-setsize={total}
         data-active={active || undefined}
         onClick={() => onOpen(conversation.id)}
         className={cn(
            'group relative flex w-full cursor-pointer gap-3 border-b px-3 py-2 text-left transition-colors',
            compact ? 'h-[68px]' : 'h-[92px]',
            active ? 'bg-accent' : 'hover:bg-muted/60',
            unread && !active && 'bg-primary/[0.04]'
         )}
      >
         {unread ? <span aria-hidden className="absolute top-0 bottom-0 left-0 w-0.5 bg-primary" /> : null}
         <div className="flex shrink-0 items-start gap-2 pt-0.5">
            <span
               className={cn(
                  'pt-1 transition-opacity',
                  selecting || checked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
               )}
               onClick={event => {
                  event.stopPropagation()
                  onToggle(conversation.id, event.shiftKey)
               }}
            >
               <Checkbox checked={checked} aria-label={`Select the conversation with ${conversation.contact.name}`} />
            </span>
            <AvatarPair
               contact={conversation.contact.name}
               contactImage={conversation.contact.imageUrl}
               account={account}
               direction={preview.from}
            />
         </div>
         <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
            <div className="flex items-baseline gap-2">
               {unread ? (
                  <span aria-label="Unread" className="size-2 shrink-0 translate-y-[-1px] rounded-full bg-primary" />
               ) : null}
               <span className={cn('min-w-0 flex-1 truncate text-sm', unread ? 'font-semibold' : 'font-medium')}>
                  <Marked text={conversation.contact.name} tokens={tokens} />
                  {conversation.kind === 'GROUP' ? (
                     <span className="font-normal text-muted-foreground">
                        {' '}
                        and {conversation.participants.length - 1} more
                     </span>
                  ) : null}
               </span>
               <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {row.lastAt ? formatListTime(row.lastAt, now) : ''}
               </span>
            </div>
            <div className="flex items-center gap-2">
               <p
                  className={cn(
                     'min-w-0 flex-1 truncate text-[13px]',
                     unread ? 'text-foreground' : 'text-muted-foreground'
                  )}
               >
                  <span className="text-muted-foreground">{preview.from === 'ME' ? 'You: ' : ''}</span>
                  <Marked text={preview.text || 'No messages'} tokens={tokens} />
               </p>
               {compact ? <StatusChip status={status} lastReplyAt={lastReplyAt(conversation)} now={now} /> : null}
            </div>
            {compact ? null : (
               <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                  <AccountChip account={account} prefix={preview.from === 'THEM' ? 'To' : 'From'} className="shrink" />
                  <StatusChip status={status} lastReplyAt={lastReplyAt(conversation)} now={now} />
                  {row.draft ? (
                     <span className="shrink-0 rounded-full border px-1.5 text-[11px] leading-5 text-muted-foreground">
                        Draft
                     </span>
                  ) : null}
                  {otherAccounts > 0 ? (
                     <span
                        className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-info"
                        title={`Also in ${otherAccounts} other ${otherAccounts === 1 ? 'account' : 'accounts'}`}
                     >
                        <Users className="size-3" aria-hidden />+{otherAccounts}
                        <span className="sr-only">other {otherAccounts === 1 ? 'account' : 'accounts'}</span>
                     </span>
                  ) : null}
               </div>
            )}
         </div>
      </div>
   )
}

export const ConversationRow = memo(ConversationRowView)
