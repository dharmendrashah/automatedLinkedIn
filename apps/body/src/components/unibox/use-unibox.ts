import { useCallback, useEffect, useRef, useState } from 'react'

import { type Attachment, type UniboxAccount, type UniboxConversation } from './types'

import { waitForStored } from './afterSent'
import { type SendEvents, type SendResult, type UniboxSource } from './source'
import { type Action, reduce } from './store'

// How long a reply can still be taken back before it goes.
export const UNDO_MS = 5000

type Loaded =
   | { status: 'loading' }
   | { status: 'error' }
   | {
        status: 'ready'
        accounts: UniboxAccount[]
        sample: boolean
        canSend: boolean
        canStart: boolean
        canRefresh: boolean
     }

// The conversations and what happens to them. A reply is held for UNDO_MS (so it can be undone), then sent through the source;
// it ends as a message in the conversation, or as a failure that keeps its text and can be retried.
// `onSaveError` is called when a mark (read, unread, done) could not be kept; the page then says so.
export const useUnibox = (source: UniboxSource, onSaveError: () => void) => {
   const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' })
   const [conversations, setConversations] = useState<UniboxConversation[]>([])
   // The replies past the point of undo: on their way.
   const [flying, setFlying] = useState<ReadonlySet<string>>(new Set())
   const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
   const latest = useRef<{ conversations: UniboxConversation[]; accounts: UniboxAccount[] }>({
      conversations: [],
      accounts: [],
   })

   const opened = useRef(new Set<string>())
   // The replies brain has that this page is following, by reply id, so one is followed once.
   const following = useRef(new Set<string>())
   // Who to tell when a first message is stored, by the id of its stand-in.
   const movers = useRef(new Map<string, (id: string) => void>())

   // The change is made at once on the page and kept with the data behind it.
   const dispatch = useCallback(
      (action: Action) => {
         setConversations(state => reduce(state, action))

         const replyId =
            action.type === 'DISMISS_FAILED'
               ? latest.current.conversations.find(item => item.id === action.id)?.failed?.replyId
               : undefined
         const saving =
            action.type === 'READ'
               ? source.mark(action.ids, { unread: false })
               : action.type === 'UNREAD'
                 ? source.mark(action.ids, { unread: true })
                 : action.type === 'DONE'
                   ? source.mark(action.ids, { done: true })
                   : action.type === 'UNDONE'
                     ? source.mark(action.ids, { done: false })
                     : replyId
                       ? source.dismissReply?.(replyId)
                       : undefined

         saving?.catch(onSaveError)
      },
      [source, onSaveError]
   )

   // A list holds only the latest messages of a conversation; the whole of it is fetched once, when it is opened.
   const load = useCallback(
      async (id: string) => {
         if (opened.current.has(id)) {
            return
         }

         opened.current.add(id)

         try {
            const conversation = await source.open(id)

            if (conversation) {
               setConversations(state => reduce(state, { type: 'OPENED', id, conversation }))
            }
         } catch {
            opened.current.delete(id)
         }
      },
      [source]
   )

   const stopFlying = useCallback((id: string) => {
      setFlying(set => {
         const next = new Set(set)

         next.delete(id)

         return next
      })
   }, [])

   // How a reply ends: a sentence when it did not go, or, when LinkedIn took it, the wait for its message to be stored and shown.
   const conclude = useCallback(
      async (id: string, result: SendResult) => {
         stopFlying(id)

         if (!result.ok) {
            dispatch({ type: 'FAIL', id, reason: result.reason, unsure: result.unsure })

            return
         }

         const conversation = latest.current.conversations.find(item => item.id === id)
         const before = conversation?.messageCount ?? conversation?.messages.length ?? 0

         dispatch({ type: 'SENT', id })

         // A first message: the conversation is new, so it is the stored one that takes the place of the stand-in.
         if (conversation?.starting) {
            const real = result.conversationId ? await waitForStored(source, result.conversationId, 0) : undefined

            if (real) {
               dispatch({ type: 'REPLACE', id, conversation: real })
               movers.current.get(id)?.(real.id)
            } else {
               dispatch({ type: 'FINISHED', id, now: Date.now(), stored: false })
            }

            movers.current.delete(id)

            return
         }

         const stored = await waitForStored(source, id, before)

         if (stored) {
            dispatch({ type: 'OPENED', id, conversation: stored })
         }

         dispatch({ type: 'FINISHED', id, now: Date.now(), stored: stored !== undefined })
      },
      [dispatch, source, stopFlying]
   )

   // A reply brain already has (it was on its way when the page loaded): followed until it ends, as one sent from here is.
   const follow = useCallback(
      async (id: string, replyId: string) => {
         if (following.current.has(replyId) || !source.follow) {
            return
         }

         following.current.add(replyId)
         setFlying(set => new Set(set).add(id))

         const result: SendResult = await source
            .follow(replyId, wait => dispatch({ type: 'WAITING', id, wait }))
            .catch(() => ({
               ok: false as const,
               unsure: true,
               reason: 'No answer came. Check the conversation on LinkedIn.',
            }))

         following.current.delete(replyId)
         await conclude(id, result)
      },
      [conclude, dispatch, source]
   )

   const run = useCallback(() => {
      source
         .load()
         .then(data => {
            opened.current.clear()
            setConversations(data.conversations)
            setLoaded({
               status: 'ready',
               accounts: data.accounts,
               sample: data.sample,
               canSend: data.canSend,
               canStart: data.canStart,
               canRefresh: data.canRefresh,
            })

            for (const { id, sending } of data.conversations) {
               if (sending?.replyId) {
                  void follow(id, sending.replyId)
               }
            }
         })
         .catch(() => setLoaded({ status: 'error' }))
   }, [source, follow])

   const reload = useCallback(() => {
      setLoaded({ status: 'loading' })
      run()
   }, [run])

   useEffect(run, [run])

   useEffect(() => {
      latest.current = {
         conversations,
         accounts: loaded.status === 'ready' ? loaded.accounts : [],
      }
   })

   const settle = useCallback(
      async (id: string, text: string, attachments: Attachment[]) => {
         const { conversations: all, accounts } = latest.current
         const conversation = all.find(item => item.id === id)
         const account = accounts.find(item => item.id === conversation?.accountId)

         setFlying(set => new Set(set).add(id))

         let startedId: string | undefined
         const events: SendEvents = {
            progress: percent => dispatch({ type: 'PROGRESS', id, percent }),
            started: replyId => {
               startedId = replyId
               following.current.add(replyId)
               dispatch({ type: 'STARTED', id, replyId, since: Date.now() })
            },
            waiting: wait => dispatch({ type: 'WAITING', id, wait }),
         }
         const answer = async (): Promise<SendResult> => {
            if (!account) {
               return { ok: false, reason: 'The account of this conversation is not known.' }
            }

            if (conversation?.starting) {
               if (attachments.length > 0) {
                  return { ok: false, reason: 'Files can be sent once the conversation has begun. Send words first.' }
               }

               return source.start
                  ? source.start(account, conversation.starting.slug, text, events)
                  : { ok: false, reason: 'A new conversation cannot be started from here.' }
            }

            return source.send(account, text, attachments, id, events)
         }
         const result: SendResult = await answer().catch(() => ({
            ok: false as const,
            reason: 'The reply could not be sent. Try again.',
         }))

         if (startedId) {
            following.current.delete(startedId)
         }

         await conclude(id, result)
      },
      [dispatch, source, conclude]
   )

   // Holds the reply for the time it can be taken back, then sends it.
   const hold = useCallback(
      (id: string, text: string, attachments: Attachment[]) => {
         timers.current.set(
            id,
            setTimeout(() => {
               timers.current.delete(id)
               void settle(id, text, attachments)
            }, UNDO_MS)
         )
      },
      [settle]
   )

   // `onStored` hears the id of the real conversation once a first message (sent from a stand-in) is stored.
   const send = useCallback(
      (id: string, text: string, attachments: Attachment[], onStored?: (id: string) => void) => {
         if (timers.current.has(id)) {
            return
         }

         if (onStored) {
            movers.current.set(id, onStored)
         }

         dispatch({ type: 'SEND', id, text, attachments, now: Date.now() })
         hold(id, text.trim(), attachments)
      },
      [dispatch, hold]
   )

   // Takes the reply back, and gives its words back so they can be put in the composer again.
   const undo = useCallback(
      (id: string) => {
         const timer = timers.current.get(id)

         if (timer === undefined) {
            return undefined
         }

         clearTimeout(timer)
         timers.current.delete(id)
         movers.current.delete(id)

         const text = latest.current.conversations.find(item => item.id === id)?.sending?.text

         dispatch({ type: 'UNDO_SEND', id })

         return text
      },
      [dispatch]
   )

   const retry = useCallback(
      (id: string) => {
         const failed = latest.current.conversations.find(item => item.id === id)?.failed

         if (failed) {
            send(id, failed.text, failed.attachments)
         }
      },
      [send]
   )

   return {
      loaded,
      conversations,
      flying,
      dispatch,
      load,
      reload,
      send,
      undo,
      retry,
   }
}
