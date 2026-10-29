import { Button } from '@/components/ui/button'
import { ExternalLink, X } from 'lucide-react'

import { AccountAvatar, ContactAvatar } from './account-avatar'
import { AccountChip } from './account-chip'
import { stateLabel } from './account-state'
import { type Index, type Row, otherAccountsOf } from './inbox'
import { useShared } from './shared'
import { lastReplyAt } from './status'
import { StatusChip } from './status-chip'
import { agoOf, formatFull } from './time'

type Props = {
   row: Row
   index: Index
   onOpen: (id: string) => void
   onClose: () => void
   // Opens the person's drawer by profile name; absent where there is none.
   onPerson?: (slug: string) => void
}

const safeHref = (url: string | undefined) => {
   try {
      const parsed = new URL(url ?? '')

      return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : undefined
   } catch {
      return undefined
   }
}

// The side of a conversation: the person, the account that has it, and the same person in the other accounts.
export const DetailsPanel = ({ row, index, onOpen, onClose, onPerson }: Props) => {
   const { now } = useShared()
   const { conversation, account } = row
   const others = otherAccountsOf(index, conversation)
   const href = safeHref(conversation.contact.profileUrl)
   const first = conversation.messages[0]

   return (
      <aside aria-label="Details" className="flex h-full flex-col overflow-y-auto border-l bg-card">
         <div className="flex items-center justify-between border-b px-3 py-2">
            <h2 className="text-sm font-semibold">Details</h2>
            <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close the details">
               <X />
            </Button>
         </div>
         <div className="space-y-5 p-3 text-sm">
            <section className="space-y-2">
               <h3 className="text-xs font-semibold text-muted-foreground uppercase">
                  {conversation.kind === 'GROUP' ? 'People' : 'Person'}
               </h3>
               <ul className="space-y-1.5">
                  {conversation.participants.map(person => (
                     <li key={`${person.name}-${person.profileUrl ?? ''}`} className="flex items-center gap-2">
                        <ContactAvatar name={person.name} imageUrl={person.imageUrl} size="sm" />
                        {conversation.kind === 'DIRECT' && conversation.contactSlug && onPerson ? (
                           <button
                              type="button"
                              onClick={() => onPerson(conversation.contactSlug ?? '')}
                              className="truncate text-left hover:underline"
                           >
                              {person.name}
                           </button>
                        ) : (
                           <span className="truncate">{person.name}</span>
                        )}
                     </li>
                  ))}
               </ul>
               {href ? (
                  <a
                     href={href}
                     target="_blank"
                     rel="noopener noreferrer nofollow"
                     className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                     Open the LinkedIn profile <ExternalLink className="size-3" aria-hidden />
                  </a>
               ) : null}
            </section>
            <section className="space-y-2">
               <h3 className="text-xs font-semibold text-muted-foreground uppercase">Account</h3>
               <div className="flex items-start gap-2">
                  <AccountAvatar account={account} size="lg" />
                  <div className="min-w-0">
                     <p className="truncate font-medium">{account?.name ?? 'Unknown account'}</p>
                     <p className="truncate text-xs text-muted-foreground">{account?.handle}</p>
                     <p className="text-xs">{account?.headline}</p>
                     {account ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                           {stateLabel(account.state)}
                           {account.lastReadAt ? `. Read ${agoOf(account.lastReadAt, now)}.` : '.'}
                        </p>
                     ) : null}
                  </div>
               </div>
            </section>
            <section className="space-y-1 text-xs">
               <h3 className="text-xs font-semibold text-muted-foreground uppercase">This conversation</h3>
               <p>
                  {conversation.messages.length} {conversation.messages.length === 1 ? 'message' : 'messages'}
                  {conversation.complete ? '' : ' read, older ones are missing'}.
               </p>
               {first ? <p>First message read: {formatFull(first.at)}.</p> : null}
            </section>
            <section className="space-y-2">
               <h3 className="text-xs font-semibold text-muted-foreground uppercase">Same person, other accounts</h3>
               {others.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                     No other account of yours has a conversation with this person.
                  </p>
               ) : (
                  <ul className="space-y-1.5">
                     {others.map(other => (
                        <li key={other.conversation.id}>
                           <button
                              type="button"
                              onClick={() => onOpen(other.conversation.id)}
                              className="flex w-full flex-col items-start gap-1 rounded-md border p-2 text-left hover:bg-accent"
                           >
                              <AccountChip account={other.account} />
                              <span className="line-clamp-2 text-xs text-muted-foreground">
                                 {other.preview.from === 'ME' ? 'You: ' : ''}
                                 {other.preview.text}
                              </span>
                              <StatusChip
                                 status={other.status}
                                 lastReplyAt={lastReplyAt(other.conversation)}
                                 now={now}
                              />
                           </button>
                        </li>
                     ))}
                  </ul>
               )}
            </section>
         </div>
      </aside>
   )
}
