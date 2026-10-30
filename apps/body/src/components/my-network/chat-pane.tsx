import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { readableError } from '@/lib/trpc-error'
import { Loader2, Send } from 'lucide-react'
import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'

import { type Person } from './types'

import { trpc } from '../../trpc'
import { nameOf } from './words'

const POLL_MS = 2000

const nothing = () => undefined

const REPLY_WORDS: Record<string, string> = {
   QUEUED: 'Waiting for the account to be free…',
   SENDING: 'Sending on LinkedIn…',
   SENT: 'Sent.',
   UNKNOWN: 'It may have been sent. Look in the Unibox before sending again.',
}

// Follows one reply until LinkedIn answers, and says where it is.
const ReplyState = ({ id, onSent }: { id: string; onSent: () => unknown }) => {
   const reply = trpc.unibox.reply.useQuery(
      { id },
      {
         refetchInterval: query =>
            query.state.data?.state === 'QUEUED' || query.state.data?.state === 'SENDING' ? POLL_MS : false,
      }
   )
   const state = reply.data?.state

   useEffect(() => {
      if (state === 'SENT') {
         onSent()
      }
   }, [state, onSent])

   return state ? (
      <p className={cn('text-sm', state === 'FAILED' && 'text-destructive')} role="status">
         {state === 'FAILED' ? `It did not go. ${reply.data?.failure ?? ''}` : REPLY_WORDS[state]}
      </p>
   ) : null
}

type Send = (text: string) => Promise<{ id: string }>

// The words to send, sent with the button or Ctrl/Cmd Enter (Enter is a new line, as in the Unibox).
const ReplyBox = ({ label, send, onSent }: { label: string; send: Send; onSent: () => unknown }) => {
   const [text, setText] = useState('')
   const [replyId, setReplyId] = useState<string | null>(null)
   const [error, setError] = useState<string | null>(null)
   const [pending, setPending] = useState(false)

   const submit = async () => {
      if (text.trim() === '' || pending) {
         return
      }

      setPending(true)
      setError(null)

      try {
         const { id } = await send(text.trim())

         setReplyId(id)
         setText('')
      } catch (failure) {
         setError(failure instanceof Error ? readableError(failure) : 'It could not be sent.')
      } finally {
         setPending(false)
      }
   }

   return (
      <div className="grid gap-2">
         <Textarea
            value={text}
            onChange={event => setText(event.target.value)}
            onKeyDown={event => {
               if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  void submit()
               }
            }}
            placeholder={label}
            aria-label={label}
            rows={3}
         />
         <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
               {error ? <p className="text-destructive text-sm">{error}</p> : null}
               {replyId ? <ReplyState key={replyId} id={replyId} onSent={onSent} /> : null}
            </div>
            <Button size="sm" disabled={pending || text.trim() === ''} onClick={() => void submit()}>
               {pending ? <Loader2 className="animate-spin" /> : <Send />}
               Send
            </Button>
         </div>
      </div>
   )
}

const Thread = ({ conversationId }: { conversationId: string }) => {
   const { client } = trpc.useUtils()
   const conversation = trpc.unibox.conversation.useQuery({ id: conversationId }, { retry: false })

   if (conversation.error) {
      return <p className="text-destructive text-sm">{readableError(conversation.error)}</p>
   }

   if (!conversation.data) {
      return <p className="text-muted-foreground text-sm">Loading the conversation…</p>
   }

   return (
      <div className="grid gap-3">
         <ol className="grid max-h-[50vh] gap-2 overflow-y-auto">
            {conversation.data.messages.map(message => (
               <li
                  key={message.id}
                  className={cn(
                     'max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap',
                     message.direction === 'ME' ? 'bg-primary/10 justify-self-end' : 'bg-muted justify-self-start'
                  )}
               >
                  <span className="text-muted-foreground block text-xs">
                     {message.direction === 'ME' ? 'You' : (message.sender ?? 'Them')} · {message.when}
                  </span>
                  {message.text || (message.attachments.length > 0 ? 'A file' : '')}
               </li>
            ))}
         </ol>
         <ReplyBox
            label="Type a reply…"
            send={text =>
               client.unibox.send.mutate({
                  conversationId,
                  text,
               })
            }
            onSent={conversation.refetch}
         />
      </div>
   )
}

// The Chat tab: the conversation of one of the client's accounts with the person, or a first message to a connection.
export const ChatPane = ({ person }: { person: Person }) => {
   const { client } = trpc.useUtils()
   const conversation = person.links.find(({ kind }) => kind === 'CONVERSATION')
   const connection = person.links.find(({ kind, accountId }) => kind === 'CONNECTION' && accountId)
   const accountId = connection?.accountId

   if (conversation) {
      return <Thread conversationId={conversation.sourceId} />
   }

   if (accountId && !person.doNotContact) {
      return (
         <div className="grid gap-2">
            <p className="text-muted-foreground text-sm">
               No conversation yet. The message goes from{' '}
               {connection.account?.displayName ?? connection.account?.email ?? 'the connected account'}.
            </p>
            <ReplyBox
               label="Write a first message…"
               send={text =>
                  client.unibox.start.mutate({
                     accountId,
                     slug: person.slug,
                     text,
                  })
               }
               onSent={nothing}
            />
         </div>
      )
   }

   return <p className="text-muted-foreground text-sm">No conversation with {nameOf(person)} yet.</p>
}
