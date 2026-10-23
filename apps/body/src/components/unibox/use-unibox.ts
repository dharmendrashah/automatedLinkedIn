import { useCallback, useEffect, useRef, useState } from 'react'

import { type Attachment, type UniboxAccount, type UniboxConversation } from './types'

import { type UniboxSource } from './source'
import { type Action, reduce } from './store'

// How long a reply can still be taken back before it goes.
export const UNDO_MS = 5000

type Loaded =
   | { status: 'loading' }
   | { status: 'error' }
   | { status: 'ready'; accounts: UniboxAccount[]; sample: boolean; canSend: boolean; canRefresh: boolean }

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

   // The change is made at once on the page and kept with the data behind it.
   const dispatch = useCallback(
      (action: Action) => {
         setConversations(state => reduce(state, action))

         const saving =
            action.type === 'READ'
               ? source.mark(action.ids, { unread: false })
               : action.type === 'UNREAD'
                 ? source.mark(action.ids, { unread: true })
                 : action.type === 'DONE'
                   ? source.mark(action.ids, { done: true })
                   : action.type === 'UNDONE'
                     ? source.mark(action.ids, { done: false })
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
               canRefresh: data.canRefresh,
            })
         })
         .catch(() => setLoaded({ status: 'error' }))
   }, [source])

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

         const result = account
            ? await source
                 .send(account, text, attachments)
                 .catch(() => ({ ok: false as const, reason: 'The reply could not be sent. Try again.' }))
            : { ok: false as const, reason: 'The account of this conversation is not known.' }

         setFlying(set => {
            const next = new Set(set)

            next.delete(id)

            return next
         })
         dispatch(result.ok ? { type: 'SENT', id, now: Date.now() } : { type: 'FAIL', id, reason: result.reason })
      },
      [dispatch, source]
   )

   const send = useCallback(
      (id: string, text: string, attachments: Attachment[]) => {
         if (timers.current.has(id)) {
            return
         }

         dispatch({ type: 'SEND', id, text, attachments, now: Date.now() })
         timers.current.set(
            id,
            setTimeout(() => {
               timers.current.delete(id)
               void settle(id, text.trim(), attachments)
            }, UNDO_MS)
         )
      },
      [dispatch, settle]
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
