import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
   AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
   ArrowDown,
   ArrowLeft,
   Check,
   CircleAlert,
   CornerUpLeft,
   Info,
   Loader2,
   MailOpen,
   PanelRight,
   Users,
} from 'lucide-react'
import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

import { AvatarPair } from './account-avatar'
import { AccountChip } from './account-chip'
import { type Row } from './inbox'
import { AttachmentView, MessageBubble } from './message-bubble'
import { useShared } from './shared'
import { lastReplyAt } from './status'
import { StatusChip } from './status-chip'
import { buildThread } from './thread-model'
import { ageOf, formatFull } from './time'

type Props = {
   row: Row
   otherAccounts: number
   tokens: string[]
   detailsOpen: boolean
   onBack: () => void
   onToggleDetails: () => void
   onMarkUnread: () => void
   onDone: () => void
   onUndoSend: () => void
   // False once the reply has left: it can no longer be taken back.
   canUndo: boolean
   onRetry: () => void
   onDismissFailed: () => void
   // The composer, and anything that goes under the messages.
   children: ReactNode
}

// A conversation: who it is with and through which account, how it stands, the messages by day and sender, and the composer.
export const Thread = ({
   row,
   otherAccounts,
   tokens,
   detailsOpen,
   onBack,
   onToggleDetails,
   onMarkUnread,
   onDone,
   onUndoSend,
   canUndo,
   onRetry,
   onDismissFailed,
   children,
}: Props) => {
   const { now } = useShared()
   const { conversation, account, status } = row
   const scroller = useRef<HTMLDivElement>(null)
   const [away, setAway] = useState(false)
   const days = useMemo(() => buildThread(conversation.messages, now), [conversation.messages, now])
   const firstMine = conversation.messages.find(message => message.direction === 'ME')
   const newFrom = conversation.unread ? row.waitingSince : undefined
   const ownIndex = conversation.messages.findLastIndex(message => message.direction === 'ME')
   const lastOwn = conversation.messages[ownIndex]
   const count = conversation.messages.length

   // A conversation opens on its newest message; a new message or a reply brings the view to the bottom again.
   useLayoutEffect(() => {
      scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
   }, [conversation.id, count, conversation.sending])

   const toBottom = () => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
   const toLastOwn = () =>
      document.getElementById(`msg-${lastOwn?.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })

   return (
      <section
         aria-label={`Conversation with ${conversation.contact.name}`}
         className="flex h-full min-h-0 flex-col bg-background"
      >
         <header className="space-y-1.5 border-b bg-card px-3 py-2">
            <div className="flex items-center gap-2">
               <Button
                  variant="ghost"
                  size="icon-sm"
                  className="@3xl/main:hidden"
                  onClick={onBack}
                  aria-label="Back to the list"
               >
                  <ArrowLeft />
               </Button>
               <AvatarPair
                  contact={conversation.contact.name}
                  contactImage={conversation.contact.imageUrl}
                  account={account}
                  direction={row.preview.from}
               />
               <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {conversation.contact.name}
                  {conversation.kind === 'GROUP' ? (
                     <span className="font-normal text-muted-foreground">
                        {' '}
                        and {conversation.participants.length - 1} more
                     </span>
                  ) : null}
               </h2>
               <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onMarkUnread}
                  disabled={conversation.unread}
                  aria-label="Mark unread"
                  title="Mark unread (U)"
               >
                  <MailOpen />
               </Button>
               <Button
                  variant="outline"
                  size="sm"
                  onClick={onDone}
                  disabled={status !== 'NEEDS_REPLY'}
                  title="Done, and go to the next that needs a reply (E)"
               >
                  <Check /> Done
               </Button>
               <Button
                  variant={detailsOpen ? 'secondary' : 'ghost'}
                  size="icon-sm"
                  onClick={onToggleDetails}
                  aria-pressed={detailsOpen}
                  aria-label="Details"
                  title="Details"
               >
                  <PanelRight />
               </Button>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
               <AccountChip account={account} prefix={row.preview.from === 'THEM' ? 'To' : 'From'} />
               <StatusChip status={status} lastReplyAt={lastReplyAt(conversation)} now={now} long />
               {otherAccounts > 0 ? (
                  <button
                     type="button"
                     onClick={onToggleDetails}
                     className="inline-flex items-center gap-1 text-xs text-info hover:underline"
                  >
                     <Users className="size-3" aria-hidden />
                     Also in {otherAccounts} other {otherAccounts === 1 ? 'account' : 'accounts'}
                  </button>
               ) : null}
            </div>
         </header>
         {firstMine || row.waitingSince ? (
            <p className="flex flex-wrap gap-x-3 border-b bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
               {firstMine ? (
                  <span>You first wrote {formatFull(firstMine.at)}.</span>
               ) : (
                  <span>You have not written yet.</span>
               )}
               {row.waitingSince ? (
                  <span className="text-foreground">
                     Waiting for your reply since {formatFull(row.waitingSince)} ({ageOf(row.waitingSince, now)}).
                  </span>
               ) : null}
            </p>
         ) : null}
         <div className="relative min-h-0 flex-1">
            <div
               ref={scroller}
               onScroll={event => {
                  const el = event.currentTarget

                  setAway(el.scrollHeight - el.scrollTop - el.clientHeight > 400)
               }}
               className="h-full overflow-y-auto px-3 py-4"
               aria-live="off"
            >
               {conversation.complete ? null : (
                  <p className="mx-auto mb-4 flex max-w-md items-center justify-center gap-1.5 rounded-md bg-muted px-3 py-1.5 text-center text-xs text-muted-foreground">
                     <Info className="size-3.5 shrink-0" aria-hidden />
                     Only part of this conversation was read. Older messages are not shown.
                  </p>
               )}
               {days.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                     No messages in this conversation yet.
                  </p>
               ) : null}
               {days.map(day => (
                  <div key={day.at} className="[contain-intrinsic-size:auto_160px] [content-visibility:auto]">
                     <div className="sticky top-0 z-10 my-3 flex justify-center">
                        <span className="rounded-full border bg-card px-3 py-0.5 text-[11px] font-medium text-muted-foreground shadow-xs">
                           {day.label}
                        </span>
                     </div>
                     {day.groups.map(group => (
                        <div key={group.messages[0]?.id ?? group.at} className="mb-3">
                           <p
                              className={cn(
                                 'mb-1 px-1 text-[11px] text-muted-foreground',
                                 group.direction === 'ME' && 'text-right'
                              )}
                           >
                              {group.direction === 'ME' ? 'You' : group.sender} · {formatFull(group.at)}
                           </p>
                           <div className="flex flex-col gap-1">
                              {group.messages.map(message => (
                                 <div key={message.id} id={`msg-${message.id}`}>
                                    {message.at === newFrom ? (
                                       <div
                                          role="separator"
                                          className="my-2 flex items-center gap-2 text-[11px] font-medium text-primary"
                                       >
                                          <span className="h-px flex-1 bg-primary/40" />
                                          New messages
                                          <span className="h-px flex-1 bg-primary/40" />
                                       </div>
                                    ) : null}
                                    <MessageBubble message={message} tokens={tokens} />
                                 </div>
                              ))}
                           </div>
                        </div>
                     ))}
                  </div>
               ))}
               {conversation.sending ? (
                  <div className="mb-3 flex justify-end" role="status">
                     <div className="flex max-w-[min(34rem,85%)] flex-col gap-1.5 rounded-2xl rounded-br-md bg-primary/60 px-3.5 py-2 text-sm text-primary-foreground">
                        <div className="flex items-center gap-2">
                           <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                           <span className="min-w-0 break-words whitespace-pre-wrap">
                              {conversation.sending.text ||
                                 (conversation.sending.attachments.length > 0 ? 'Sending files' : 'Attachment')}
                           </span>
                           {canUndo ? (
                              <Button variant="secondary" size="xs" onClick={onUndoSend}>
                                 <CornerUpLeft /> Undo
                              </Button>
                           ) : null}
                        </div>
                        {conversation.sending.attachments.length > 0 ? (
                           <div className="flex flex-wrap gap-1.5">
                              {conversation.sending.attachments.map((attachment, index) => (
                                 <AttachmentView
                                    key={index}
                                    attachment={attachment}
                                    own
                                    messageId=""
                                    index={index}
                                 />
                              ))}
                           </div>
                        ) : null}
                        {conversation.sending.progress !== undefined ? (
                           <div
                              role="progressbar"
                              aria-label="Uploading the files"
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={conversation.sending.progress}
                              className="h-1 overflow-hidden rounded-full bg-primary-foreground/30"
                           >
                              <div
                                 className="h-full bg-primary-foreground transition-[width]"
                                 style={{ width: `${conversation.sending.progress}%` }}
                              />
                           </div>
                        ) : null}
                     </div>
                  </div>
               ) : null}
               {conversation.failed ? (
                  <div
                     role="alert"
                     className="mx-auto mb-3 flex max-w-lg items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                     <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                     <div className="min-w-0 flex-1">
                        <p className="font-medium">
                           {conversation.failed.unsure ? 'The reply may have been sent.' : 'The reply did not go.'}
                        </p>
                        <p className="text-xs">{conversation.failed.reason}</p>
                        <p className="mt-1 truncate text-xs opacity-80">
                           Your reply is kept: {conversation.failed.text || 'an attachment'}
                        </p>
                        <div className="mt-2 flex gap-2">
                           {conversation.failed.unsure ? (
                              <AlertDialog>
                                 <AlertDialogTrigger asChild>
                                    <Button variant="outline" size="xs">
                                       Send again
                                    </Button>
                                 </AlertDialogTrigger>
                                 <AlertDialogContent>
                                    <AlertDialogHeader>
                                       <AlertDialogTitle>It may have been sent</AlertDialogTitle>
                                       <AlertDialogDescription>
                                          Check on LinkedIn first. Sending again could put the same message in the
                                          conversation twice.
                                       </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                       <AlertDialogCancel>Do not send</AlertDialogCancel>
                                       <AlertDialogAction onClick={onRetry}>Send again</AlertDialogAction>
                                    </AlertDialogFooter>
                                 </AlertDialogContent>
                              </AlertDialog>
                           ) : (
                              <Button variant="outline" size="xs" onClick={onRetry}>
                                 Retry
                              </Button>
                           )}
                           <Button variant="ghost" size="xs" onClick={onDismissFailed}>
                              Dismiss
                           </Button>
                        </div>
                     </div>
                  </div>
               ) : null}
            </div>
            {away ? (
               <div className="absolute right-3 bottom-3 flex flex-col items-end gap-1.5">
                  {lastOwn ? (
                     <Button variant="outline" size="xs" className="bg-card shadow-sm" onClick={toLastOwn}>
                        <CornerUpLeft /> My last message
                     </Button>
                  ) : null}
                  <Button size="xs" className="shadow-sm" onClick={toBottom}>
                     <ArrowDown /> Jump to latest
                  </Button>
               </div>
            ) : null}
         </div>
         {children}
      </section>
   )
}
