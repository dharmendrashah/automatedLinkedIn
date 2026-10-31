import { DetailDrawers } from '@/components/details/detail-drawers'
import { useDetailDrawer } from '@/components/details/use-detail-drawer'
import { NextCheckLine } from '@/components/next-check-line'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'

import {
   type Attachment,
   type Recipient,
   type RecipientPage,
   type RecipientSearch,
   type UniboxAccount,
} from '../components/unibox/types'

import { type AccountSet, parseSets, setMatching } from '../components/unibox/accountSets'
import { type Address, parseAddress, toAddress } from '../components/unibox/address'
import { withDevFile } from '../components/unibox/chooseSource'
import { Composer } from '../components/unibox/composer'
import { ConversationList } from '../components/unibox/conversation-list'
import { DetailsPanel } from '../components/unibox/details-panel'
import { type Drafts, parseDrafts, setDraft } from '../components/unibox/drafts'
import { buildIndex, countsOf, filterRows, nextToReply, otherAccountsOf, sortRows } from '../components/unibox/inbox'
import { commandFor, escapeStep, isTyping } from '../components/unibox/keyboard'
import { NewMessage } from '../components/unibox/new-message'
import { directOutcome, draftConversation, isPlaceholder, startingAccounts } from '../components/unibox/newMessage'
import { EmptyList, HelpDialog, NoConversation, SampleBanner } from '../components/unibox/notices'
import { Palette, type PaletteItem, SelectionBar } from '../components/unibox/palette'
import { loadRealSample } from '../components/unibox/sample/real'
import { createSampleSource } from '../components/unibox/sample/source'
import { tokensOf } from '../components/unibox/search'
import * as selecting from '../components/unibox/selection'
import { SharedProvider } from '../components/unibox/shared'
import { lastReplyAt } from '../components/unibox/status'
import { KEYS, readJson, writeJson } from '../components/unibox/storage'
import { firstName } from '../components/unibox/templates'
import { Thread } from '../components/unibox/thread'
import { agoOf, sameDay } from '../components/unibox/time'
import { ComposeButton, SearchBox, Toolbar } from '../components/unibox/toolbar'
import { createTrpcSource } from '../components/unibox/trpcSource'
import { createUpload } from '../components/unibox/upload'
import { UNDO_MS, useUnibox } from '../components/unibox/use-unibox'
import { viewLabel } from '../components/unibox/views'
import { ViewsList } from '../components/unibox/views-list'
import { trpc } from '../trpc'

const fileSource = createSampleSource({ loadReal: loadRealSample })
const storage = typeof localStorage === 'undefined' ? undefined : localStorage

const parsePicked = (raw: unknown): ReadonlySet<string> | undefined => {
   const ids = Array.isArray(raw)
      ? (raw as unknown[]).filter((value): value is string => typeof value === 'string')
      : []

   return ids.length > 0 ? new Set(ids) : undefined
}

// On a narrow page one pane shows at a time: the list is hidden while a conversation is open.
const oneAtATime = () => document.querySelector<HTMLElement>('[data-unibox-list]')?.offsetWidth === 0

// The page fills the dashboard's content area edge to edge: it cancels the layout's padding and stops short of the inset's margin.
const FRAME =
   '-my-4 h-[calc(100svh-var(--header-height)-1px)] min-h-[30rem] w-full overflow-hidden md:-my-6 md:h-[calc(100svh-var(--header-height)-1rem-1px)] md:rounded-b-xl'

type Api = ReturnType<typeof useUnibox>

// The width from which the views get their own rail (72rem, as the old container query).
const RAIL_FROM_PX = 1152

type BoardProps = {
   accounts: UniboxAccount[]
   sample: boolean
   canSend: boolean
   // Whether a first message can be sent to a connection not talked to yet.
   canStart: boolean
   // The search of the connections New message lists; absent when there is none.
   loadRecipients: ((search: RecipientSearch) => Promise<RecipientPage>) | undefined
   // One connection of one account, for an address that names them (Message on a Connections page).
   findRecipient: ((accountId: string, slug: string) => Promise<Recipient | null>) | undefined
   // Asks for the messages to be read again; absent when the data has nothing to read.
   onRefresh: ((accountIds?: string[]) => void) | undefined
   // Opens a kept file of a message.
   onOpenFile: (messageId: string, index: number) => void
   // A short link to read a kept file, to show a picture; absent when the data keeps none.
   onFileUrl: ((messageId: string, index: number) => Promise<string>) | undefined
   api: Api
}

const Board = ({
   accounts,
   sample,
   canSend,
   canStart,
   loadRecipients,
   findRecipient,
   onRefresh,
   onOpenFile,
   onFileUrl,
   api,
}: BoardProps) => {
   const { conversations, flying, dispatch, load, send, undo, retry } = api
   const { pathname, search } = useLocation()
   const navigate = useNavigate()
   const address = useMemo(() => parseAddress(pathname, search), [pathname, search])
   const { view, sort, conversationId, compose } = address
   const [query, setQuery] = useState(address.query)
   const deferredQuery = useDeferredValue(query)
   const [now, setNow] = useState(() => Date.now())
   const [drafts, setDrafts] = useState<Drafts>(() => readJson(storage, KEYS.drafts, parseDrafts, {}))
   const [picked, setPicked] = useState<ReadonlySet<string> | undefined>(() =>
      readJson(storage, KEYS.selection, parsePicked, undefined)
   )
   const [sets, setSets] = useState<AccountSet[]>(() => readJson(storage, KEYS.accountSets, parseSets, []))
   const [compact, setCompact] = useState<boolean>(() => readJson(storage, KEYS.density, raw => raw === true, false))
   const [selection, setSelection] = useState<selecting.Selection>(selecting.empty)
   const [detailsOpen, setDetailsOpen] = useState(false)
   const [paletteOpen, setPaletteOpen] = useState(false)
   const [helpOpen, setHelpOpen] = useState(false)
   // The accounts New message was last narrowed to in this tab ('ALL' when the owner chose every account).
   const [composeAccounts, setComposeAccounts] = useState<ReadonlySet<string> | 'ALL'>()
   // The composer takes the focus once the conversation opened from a Connections page shows.
   const focusComposer = useRef(false)
   const personDrawer = useDetailDrawer()
   const showPerson = (slug: string) => personDrawer.show('person', slug)
   const searchRef = useRef<HTMLInputElement>(null)
   const composerRef = useRef<HTMLTextAreaElement>(null)
   const gridRef = useRef<HTMLDivElement>(null)
   // Wide enough for the rail of views; measured, so the one search box is rendered in one place only.
   const [wide, setWide] = useState(false)
   const anchor = useRef<string | undefined>(undefined)
   const keepUnread = useRef<string | undefined>(undefined)
   // Moves the pane from a first message's stand-in to the stored conversation, only when the owner is still looking at the stand-in.
   const moveTo = useRef<(from: string, to: string) => void>(() => undefined)

   // Going to a conversation, to none, or to the New message view changes the right pane; any other change keeps what is open.
   const go = useCallback(
      (patch: Partial<Address>, replace = true) =>
         navigate(
            toAddress({
               view,
               sort,
               query,
               ...('conversationId' in patch || 'compose' in patch ? {} : { conversationId, compose }),
               ...patch,
            }),
            { replace }
         ),
      [navigate, conversationId, compose, view, sort, query]
   )

   useEffect(() => {
      const timer = setInterval(() => setNow(Date.now()), 60_000)

      return () => clearInterval(timer)
   }, [])

   useEffect(() => {
      const grid = gridRef.current

      if (!grid || typeof ResizeObserver === 'undefined') {
         return undefined
      }

      const observer = new ResizeObserver(([entry]) => setWide((entry?.contentRect.width ?? 0) >= RAIL_FROM_PX))

      observer.observe(grid)

      return () => observer.disconnect()
   }, [])

   // The address follows the search box, never the other way round, so back and forward do not rewrite what was typed.
   const changeQuery = (next: string) => {
      setQuery(next)
      go({ query: next })
   }

   useEffect(() => void writeJson(storage, KEYS.drafts, drafts), [drafts])
   useEffect(() => void writeJson(storage, KEYS.selection, picked ? [...picked] : null), [picked])
   useEffect(() => void writeJson(storage, KEYS.accountSets, sets), [sets])
   useEffect(() => void writeJson(storage, KEYS.density, compact), [compact])

   const draftKey = Object.keys(drafts).join('\u0000')
   const draftIds = useMemo(() => new Set(draftKey ? draftKey.split('\u0000') : []), [draftKey])
   const index = useMemo(() => buildIndex(accounts, conversations, draftIds), [accounts, conversations, draftIds])
   const accountIds = useMemo(() => {
      const known = new Set(accounts.map(account => account.id))
      const kept = new Set([...(picked ?? [])].filter(id => known.has(id)))

      return kept.size > 0 ? kept : undefined
   }, [accounts, picked])
   const counts = useMemo(() => countsOf(index, accountIds), [index, accountIds])
   const total = counts.ALL
   const rows = useMemo(
      () => sortRows(filterRows(index, { view, accountIds, query: deferredQuery }), sort),
      [index, view, accountIds, deferredQuery, sort]
   )
   const tokens = useMemo(() => tokensOf(deferredQuery), [deferredQuery])
   const active = conversationId ? index.byId.get(conversationId) : undefined
   const activeId = active?.conversation.id
   // The list holds the latest messages only; the rest comes when the conversation is opened.
   const activePartial =
      active !== undefined &&
      active.conversation.messageCount !== undefined &&
      active.conversation.messages.length < active.conversation.messageCount

   useEffect(() => {
      if (activeId && activePartial) {
         void load(activeId)
      }
   }, [activeId, activePartial, load])

   // A conversation opened from New message and left without a word goes from the list again.
   const lastOpen = useRef<string | undefined>(undefined)

   useEffect(() => {
      const left = lastOpen.current

      lastOpen.current = conversationId

      if (left && left !== conversationId && isPlaceholder(left) && !drafts[left]?.trim()) {
         dispatch({ type: 'DISCARD', id: left })
      }
   }, [conversationId, drafts, dispatch])

   const shared = useMemo(() => {
      const names = new Map<string, number>()
      const today = new Map<string, number>()

      for (const account of accounts) {
         names.set(account.name, (names.get(account.name) ?? 0) + 1)
      }

      for (const { accountId, messages } of conversations) {
         const count = messages.filter(message => sameDay(message.at, now)).length

         if (count > 0) {
            today.set(accountId, (today.get(accountId) ?? 0) + count)
         }
      }

      return {
         now,
         accountById: new Map(accounts.map(account => [account.id, account])),
         ambiguousNames: new Set([...names].filter(([, count]) => count > 1).map(([name]) => name)),
         today,
         index,
         openFile: onOpenFile,
         ...(onFileUrl && { fileUrl: onFileUrl }),
      }
   }, [accounts, conversations, now, index, onOpenFile, onFileUrl])

   const unreadByAccount = useMemo(() => {
      const map = new Map<string, number>()

      for (const row of index.rows) {
         if (row.conversation.unread) {
            map.set(row.conversation.accountId, (map.get(row.conversation.accountId) ?? 0) + 1)
         }
      }

      return map
   }, [index])

   // Opening a conversation reads it, once it has been in front of the owner for a moment, unless they marked it unread on purpose.
   const activeUnread = active?.conversation.unread ?? false

   useEffect(() => {
      if (keepUnread.current !== activeId) {
         keepUnread.current = undefined
      }

      if (!activeId || !activeUnread || keepUnread.current === activeId) {
         return undefined
      }

      const timer = setTimeout(() => {
         if (document.visibilityState === 'visible') {
            dispatch({ type: 'READ', ids: [activeId] })
         }
      }, 1500)

      return () => clearTimeout(timer)
   }, [activeId, activeUnread, dispatch])

   const open = useCallback((id: string) => go({ conversationId: id }, false), [go])

   const onToggle = useCallback(
      (id: string, range: boolean) => {
         const order = rows.map(row => row.conversation.id)

         setSelection(current =>
            range && anchor.current
               ? selecting.range(current, order, anchor.current, id)
               : selecting.toggle(current, id)
         )
         anchor.current = id
      },
      [rows]
   )

   const markUnread = () => {
      if (activeId) {
         keepUnread.current = activeId
         dispatch({ type: 'UNREAD', ids: [activeId] })
      }
   }

   const doneAndNext = () => {
      if (!active || active.status !== 'NEEDS_REPLY') {
         return
      }

      const id = active.conversation.id
      const next = nextToReply(rows, id)

      dispatch({ type: 'DONE', ids: [id], now: Date.now() })
      go({ conversationId: next })
      toast(`Done with ${active.conversation.contact.name}`, {
         action: {
            label: 'Undo',
            onClick: () => {
               dispatch({ type: 'UNDONE', ids: [id] })
               go({ conversationId: id })
            },
         },
      })
   }

   const bulk = (kind: 'READ' | 'UNREAD' | 'DONE') => {
      const wanted = new Set(
         selecting.resolve(
            selection,
            rows.map(row => row.conversation.id)
         )
      )
      const ids = rows
         .filter(row => wanted.has(row.conversation.id))
         .filter(row =>
            kind === 'READ'
               ? row.conversation.unread
               : kind === 'UNREAD'
                 ? !row.conversation.unread
                 : row.status === 'NEEDS_REPLY'
         )
         .map(row => row.conversation.id)

      setSelection(selecting.empty)

      if (ids.length === 0) {
         toast.info('Nothing to change in the selection.')

         return
      }

      const undoType = kind === 'READ' ? 'UNREAD' : kind === 'UNREAD' ? 'READ' : 'UNDONE'

      dispatch(kind === 'DONE' ? { type: 'DONE', ids, now: Date.now() } : { type: kind, ids })
      toast(`${ids.length} marked ${kind === 'DONE' ? 'done' : kind.toLowerCase()}`, {
         action: {
            label: 'Undo',
            onClick: () => dispatch({ type: undoType, ids }),
         },
      })
   }

   const markAllRead = () => {
      const ids = index.rows
         .filter(row => row.conversation.unread && (!accountIds || accountIds.has(row.conversation.accountId)))
         .map(row => row.conversation.id)

      dispatch({ type: 'READ', ids })
      toast(`${ids.length} marked read`, {
         action: {
            label: 'Undo',
            onClick: () => dispatch({ type: 'UNREAD', ids }),
         },
      })
   }

   const goToNeeds = () => {
      const [first] = sortRows(filterRows(index, { view: 'NEEDS_REPLY', accountIds, query: '' }), 'WAITING')

      setQuery('')
      go({ view: 'NEEDS_REPLY', sort: 'WAITING', query: '', conversationId: first?.conversation.id }, false)
   }

   // Takes a reply back and puts its words in the box again.
   const takeBack = (id: string) => {
      const words = undo(id)

      if (words !== undefined) {
         setDrafts(current => setDraft(current, id, words))
         go({ conversationId: id }, false)
      }
   }

   const handleSend = (text: string, attachments: Attachment[]) => {
      if (!active) {
         return
      }

      const id = active.conversation.id
      const next = view === 'NEEDS_REPLY' ? nextToReply(rows, id) : undefined

      // A first message: the stored conversation takes the place of the stand-in, and the pane follows it.
      send(id, text, attachments, active.conversation.starting ? stored => moveTo.current(id, stored) : undefined)
      setDrafts(current => setDraft(current, id, ''))
      toast(`Sending to ${active.conversation.contact.name}`, {
         duration: UNDO_MS,
         action: {
            label: 'Undo',
            onClick: () => takeBack(id),
         },
      })

      if (next) {
         go({ conversationId: next })
      }
   }

   // A connection picked in New message: their conversation with that account opens, or a new one to write the first message in.
   const openPerson = (person: Recipient, replace = false) => {
      if (person.conversationId && index.byId.has(person.conversationId)) {
         go({ conversationId: person.conversationId }, replace)

         return
      }

      const from = accounts.find(item => item.id === person.accountId)

      if (!from) {
         toast.error('The account of this connection is not known.')

         return
      }

      const draft = draftConversation(from, person)

      dispatch({ type: 'START', conversation: draft })
      go({ conversationId: draft.id }, replace)
   }

   // Message on a Connections page names the account and the person: their chat opens at once, with the composer ready, and the address
   // becomes the conversation's. A person not found, or on the do-not-contact list, opens New message with their name searched.
   const direct = compose?.accountId && compose.to ? { accountId: compose.accountId, to: compose.to } : undefined
   const directKey = direct ? `${direct.accountId}\u0000${direct.to}` : undefined
   const openDirect = useRef<(found: Recipient | null | 'failed') => void>(() => undefined)

   useEffect(() => {
      openDirect.current = found => {
         const accountName = accounts.find(item => item.id === direct?.accountId)?.name ?? 'this account'
         const outcome = directOutcome(found, direct?.to ?? '', accountName)

         if ('message' in outcome) {
            toast.error(outcome.message)
            go({ compose: { to: outcome.search } })

            return
         }

         focusComposer.current = true
         openPerson(outcome.open, true)
      }
   })

   useEffect(() => {
      if (!directKey || !findRecipient) {
         return undefined
      }

      let current = true
      const [accountId = '', to = ''] = directKey.split('\u0000')

      findRecipient(accountId, to)
         .then(person => current && openDirect.current(person))
         .catch(() => current && openDirect.current('failed'))

      return () => {
         current = false
      }
   }, [directKey, findRecipient])

   useEffect(() => {
      if (focusComposer.current && activeId) {
         focusComposer.current = false
         composerRef.current?.focus()
      }
   }, [activeId])

   const openCompose = () => go({ compose: {} }, false)
   const canCompose = loadRecipients !== undefined

   const dismissFailed = () => {
      if (active?.conversation.failed) {
         const { text } = active.conversation.failed
         const id = active.conversation.id

         setDrafts(current => setDraft(current, id, text))
         dispatch({ type: 'DISMISS_FAILED', id })
      }
   }

   const move = (step: 1 | -1) => {
      const at = rows.findIndex(row => row.conversation.id === activeId)
      const target =
         rows[at < 0 ? (step === 1 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, at + step))]

      if (target) {
         go({ conversationId: target.conversation.id })
      }
   }

   const leaveComposer = () => {
      if (document.activeElement instanceof HTMLElement) {
         document.activeElement.blur()
      }

      document.querySelector<HTMLElement>('[data-unibox-list]')?.focus()
   }

   const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
         // The New message dialog closes itself.
         if (event.defaultPrevented || compose) {
            return
         }

         const step = escapeStep({
            palette: paletteOpen,
            menu: false,
            details: detailsOpen,
            composer: document.activeElement === composerRef.current,
            selection: selection.all || selection.ids.size > 0,
            thread: oneAtATime() && conversationId !== undefined,
         })

         if (step === 'CLOSE_PALETTE') setPaletteOpen(false)
         else if (step === 'CLOSE_DETAILS') setDetailsOpen(false)
         else if (step === 'LEAVE_COMPOSER') leaveComposer()
         else if (step === 'CLEAR_SELECTION') setSelection(selecting.empty)
         else if (step === 'BACK') go({ conversationId: undefined })

         return
      }

      const command = commandFor(event, isTyping(event.target instanceof HTMLElement ? event.target : null))

      if (!command || event.defaultPrevented) {
         return
      }

      if (command !== 'PALETTE' && document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) {
         return
      }

      event.preventDefault()

      switch (command) {
         case 'PALETTE':
            setPaletteOpen(true)
            break
         case 'NEXT':
            move(1)
            break
         case 'PREVIOUS':
            move(-1)
            break
         case 'OPEN': {
            const [first] = rows

            if (!activeId && first) {
               open(first.conversation.id)
            }

            break
         }
         case 'REPLY':
            composerRef.current?.focus()
            break
         case 'DONE':
            doneAndNext()
            break
         case 'UNREAD':
            markUnread()
            break
         case 'SELECT':
            if (activeId) onToggle(activeId, false)
            break
         case 'SEARCH':
            searchRef.current?.focus()
            break
         case 'COMPOSE':
            if (canCompose) openCompose()
            break
         case 'HELP':
            setHelpOpen(true)
            break
      }
   }

   const latestKey = useRef(onKey)

   useEffect(() => {
      latestKey.current = onKey
      moveTo.current = (from, to) => {
         if (conversationId === from) {
            go({ conversationId: to })
         }
      }
   })

   useEffect(() => {
      const listener = (event: KeyboardEvent) => latestKey.current(event)

      document.body.classList.add('unibox-active')
      window.addEventListener('keydown', listener)

      return () => {
         document.body.classList.remove('unibox-active')
         window.removeEventListener('keydown', listener)
      }
   }, [])

   const activeSet = setMatching(sets, accountIds)
   const accountLabel = !accountIds
      ? 'All accounts'
      : (activeSet?.name ?? `${accountIds.size} ${accountIds.size === 1 ? 'account' : 'accounts'}`)
   const others = active ? otherAccountsOf(index, active.conversation) : []
   const answered = others.find(other => other.status === 'REPLIED' && lastReplyAt(other.conversation) !== undefined)
   const answeredAt = answered ? lastReplyAt(answered.conversation) : undefined
   const account = active?.account
   const blockedReason = !canSend
      ? 'Sending a reply from here is not available yet. Your draft is kept on this device.'
      : !account
        ? 'The account of this conversation is not known.'
        : account.state === 'ACTIVE'
          ? undefined
          : `This account is ${account.state === 'PAUSED' ? 'paused' : account.state === 'DISCONNECTED' ? 'disconnected' : 'restricted by LinkedIn'}, so nothing can be sent from it. Your draft is kept.`

   const commands: PaletteItem[] = [
      ...(['ALL', 'NEEDS_REPLY', 'UNREAD', 'REPLIED'] as const).map(next => ({
         id: `view-${next}`,
         label: `Show ${viewLabel(next)}`,
         run: () => go({ view: next, conversationId: undefined }),
      })),
      ...(canCompose
         ? [
              {
                 id: 'compose',
                 label: 'New message',
                 run: openCompose,
              },
           ]
         : []),
      {
         id: 'needs',
         label: 'Start with what waited longest',
         run: goToNeeds,
      },
      {
         id: 'read',
         label: 'Mark all read',
         run: markAllRead,
      },
      {
         id: 'details',
         label: detailsOpen ? 'Close the details' : 'Open the details',
         run: () => setDetailsOpen(open => !open),
      },
      {
         id: 'sort',
         label: sort === 'NEWEST' ? 'Order by waiting longest' : 'Order by newest message',
         run: () => go({ sort: sort === 'NEWEST' ? 'WAITING' : 'NEWEST' }),
      },
      {
         id: 'help',
         label: 'Keyboard shortcuts',
         run: () => setHelpOpen(true),
      },
   ]

   const findConversations = (text: string): PaletteItem[] =>
      filterRows(index, { view: 'ALL', accountIds: undefined, query: text })
         .slice(0, 8)
         .map(row => ({
            id: `c-${row.conversation.id}`,
            label: row.conversation.contact.name,
            hint: row.account?.name,
            run: () => open(row.conversation.id),
         }))

   const findAccounts = (text: string): PaletteItem[] => {
      const wantedTokens = tokensOf(text)

      return accounts
         .filter(item => wantedTokens.every(token => `${item.name} ${item.handle}`.toLowerCase().includes(token)))
         .slice(0, 5)
         .map(item => ({
            id: `a-${item.id}`,
            label: `Show only ${item.name}`,
            hint: item.handle,
            run: () => setPicked(new Set([item.id])),
         }))
   }

   return (
      <SharedProvider value={shared}>
         <div className={FRAME}>
            <div className="unibox flex h-full flex-col bg-background text-foreground">
               {sample ? <SampleBanner /> : null}
               <div className="border-b px-4 py-2">
                  <NextCheckLine
                     times={accounts
                        .filter(account => account.state === 'ACTIVE' && (!accountIds || accountIds.has(account.id)))
                        .map(({ nextReadAt }) => nextReadAt)}
                     rhythm="MESSAGES"
                     now={new Date(now)}
                  />
               </div>
               <div
                  ref={gridRef}
                  className={cn(
                     'grid min-h-0 flex-1',
                     wide
                        ? 'grid-cols-[13rem_minmax(20rem,26rem)_minmax(0,1fr)]'
                        : '@3xl/main:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)]'
                  )}
               >
                  {wide ? (
                     <div className="flex min-h-0 flex-col overflow-y-auto border-r bg-card">
                        <div className="grid gap-2 border-b p-2">
                           {canCompose ? <ComposeButton wide onCompose={openCompose} /> : null}
                           <SearchBox query={query} onQuery={changeQuery} searchRef={searchRef} />
                        </div>
                        <ViewsList counts={counts} active={view} onChange={next => go({ view: next })} />
                     </div>
                  ) : null}
                  <div
                     className={cn(
                        'min-h-0 flex-col border-r bg-card',
                        conversationId ? 'hidden @3xl/main:flex' : 'flex'
                     )}
                  >
                     <Toolbar
                        query={query}
                        onQuery={changeQuery}
                        searchRef={searchRef}
                        picker={{
                           accounts,
                           selection: accountIds,
                           unread: unreadByAccount,
                           onChange: setPicked,
                           sets,
                           onSets: setSets,
                        }}
                        accountLabel={accountLabel}
                        sort={sort}
                        onSort={next => go({ sort: next })}
                        compact={compact}
                        onCompact={setCompact}
                        needCount={counts.NEEDS_REPLY}
                        onGoToNeeds={goToNeeds}
                        unreadCount={counts.UNREAD}
                        onMarkAllRead={markAllRead}
                        shown={rows.length}
                        total={total}
                        view={view}
                        onClearView={() => go({ view: 'ALL' })}
                        onHelp={() => setHelpOpen(true)}
                        onRefresh={onRefresh ? () => onRefresh(accountIds ? [...accountIds] : undefined) : undefined}
                        onReload={api.reload}
                        onCompose={canCompose ? openCompose : undefined}
                        inRail={wide}
                     />
                     {wide ? null : (
                        <div className="border-b">
                           <ViewsList row counts={counts} active={view} onChange={next => go({ view: next })} />
                        </div>
                     )}
                     {selection.all || selection.ids.size > 0 ? (
                        <SelectionBar
                           selection={selection}
                           visible={rows.length}
                           matching={rows.length}
                           onSelectAllMatching={() => setSelection(selecting.selectAllMatching())}
                           onRead={() => bulk('READ')}
                           onUnread={() => bulk('UNREAD')}
                           onDone={() => bulk('DONE')}
                           onClear={() => setSelection(selecting.empty)}
                        />
                     ) : null}
                     <div className="min-h-0 flex-1">
                        {rows.length === 0 ? (
                           <EmptyList
                              view={view}
                              query={query}
                              accountsFiltered={accountIds !== undefined}
                              total={total}
                              onClearSearch={() => changeQuery('')}
                              onClearAccounts={() => setPicked(undefined)}
                              onAll={() => go({ view: 'ALL' })}
                              onRefresh={onRefresh ? () => onRefresh(undefined) : undefined}
                           />
                        ) : (
                           <ConversationList
                              rows={rows}
                              index={index}
                              now={now}
                              activeId={activeId}
                              selection={selection}
                              compact={compact}
                              tokens={tokens}
                              onOpen={open}
                              onToggle={onToggle}
                           />
                        )}
                     </div>
                  </div>
                  <div className={cn('min-h-0', conversationId ? 'block' : 'hidden @3xl/main:block')}>
                     {active ? (
                        <Thread
                           key={active.conversation.id}
                           row={active}
                           otherAccounts={others.length}
                           tokens={tokens}
                           detailsOpen={detailsOpen}
                           onBack={() => go({ conversationId: undefined })}
                           onToggleDetails={() => setDetailsOpen(current => !current)}
                           {...(!sample && { onPerson: showPerson })}
                           onMarkUnread={markUnread}
                           onDone={doneAndNext}
                           onUndoSend={() => takeBack(active.conversation.id)}
                           canUndo={!flying.has(active.conversation.id)}
                           onRetry={() => retry(active.conversation.id)}
                           onDismissFailed={dismissFailed}
                        >
                           <Composer
                              key={active.conversation.id}
                              conversation={active.conversation}
                              account={account}
                              draft={drafts[active.conversation.id] ?? ''}
                              onDraft={text => setDrafts(current => setDraft(current, active.conversation.id, text))}
                              onSend={handleSend}
                              blockedReason={blockedReason}
                              notice={
                                 answered && answeredAt
                                    ? `${firstName(active.conversation.contact.name) ?? active.conversation.contact.name} already got a reply from ${answered.account?.name ?? 'another account'} ${agoOf(answeredAt, now)}.`
                                    : undefined
                              }
                              textareaRef={composerRef}
                           />
                        </Thread>
                     ) : direct ? (
                        <p
                           role="status"
                           className="flex h-full items-center justify-center text-sm text-muted-foreground"
                        >
                           Opening the chat...
                        </p>
                     ) : (
                        <NoConversation needCount={counts.NEEDS_REPLY} />
                     )}
                  </div>
               </div>
            </div>
         </div>
         <Sheet open={detailsOpen && active !== undefined} onOpenChange={setDetailsOpen}>
            <SheetContent className="w-80 gap-0 p-0 sm:max-w-sm" showCloseButton={false}>
               <SheetTitle className="sr-only">Details</SheetTitle>
               <SheetDescription className="sr-only">
                  The person, the account and the same person in other accounts.
               </SheetDescription>
               {active ? (
                  <DetailsPanel
                     row={active}
                     index={index}
                     onOpen={open}
                     onClose={() => setDetailsOpen(false)}
                     {...(!sample && { onPerson: showPerson })}
                  />
               ) : null}
            </SheetContent>
         </Sheet>
         {sample ? null : <DetailDrawers kind="person" order={[]} />}
         <Palette
            open={paletteOpen}
            onOpenChange={setPaletteOpen}
            commands={commands}
            findConversations={findConversations}
            findAccounts={findAccounts}
         />
         <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
         {compose && !direct && loadRecipients ? (
            <NewMessage
               initialQuery={compose.to ?? ''}
               load={loadRecipients}
               canStart={canStart}
               accounts={accounts}
               startAccounts={startingAccounts({
                  last: composeAccounts,
                  picked: accountIds,
                  open: active?.conversation.accountId,
               })}
               onAccounts={next => setComposeAccounts(next ?? 'ALL')}
               picker={{
                  unread: unreadByAccount,
                  sets,
                  onSets: setSets,
               }}
               onPick={person => openPerson(person)}
               onClose={() => go({ conversationId: undefined })}
            />
         ) : null}
      </SharedProvider>
   )
}

export const Unibox = () => {
   const { client } = trpc.useUtils()
   const source = useMemo(() => {
      const upload = createUpload({ form: input => client.unibox.uploadForm.mutate(input) })
      // The dev messages file only when the address asks for it (`?sample`): it holds an account that may no longer exist.
      const sample = new URLSearchParams(window.location.search).has('sample')

      return withDevFile(
         fileSource,
         createTrpcSource(client, { upload }),
         async () => sample && (await loadRealSample()) !== undefined
      )
   }, [client])
   const onSaveError = useCallback(() => toast.error('A change could not be kept. Reload to see what is saved.'), [])
   const api = useUnibox(source, onSaveError)
   const { loaded, reload } = api
   // Stable, so a picture asks for its link once and not again each time the page draws.
   const fileUrl = useCallback(
      (messageId: string, index: number) =>
         source.fileLink ? source.fileLink(messageId, index) : Promise.reject(new Error('No file')),
      [source]
   )

   if (loaded.status === 'loading') {
      return (
         <div className={FRAME} aria-busy="true" aria-label="Loading the messages">
            <div className="grid h-full grid-cols-1 gap-px @3xl/main:grid-cols-[26rem_1fr] @6xl/main:grid-cols-[13rem_26rem_1fr]">
               <Skeleton className="hidden rounded-none @6xl/main:block" />
               <div className="space-y-2 p-3">
                  {Array.from({ length: 8 }, (_, index) => (
                     <Skeleton key={index} className="h-20 w-full" />
                  ))}
               </div>
               <Skeleton className="hidden rounded-none @3xl/main:block" />
            </div>
         </div>
      )
   }

   if (loaded.status === 'error') {
      return (
         <div className="flex w-full flex-col items-center gap-3 px-4 py-16 text-center lg:px-6" role="alert">
            <p className="font-medium">The messages could not be loaded.</p>
            <p className="text-sm text-muted-foreground">Nothing was lost. Try again in a moment.</p>
            <Button onClick={reload}>Try again</Button>
         </div>
      )
   }

   const openFile = (messageId: string, index: number) => {
      fileUrl(messageId, index)
         .then(url => window.open(url, '_blank', 'noopener'))
         .catch(() => toast.error('The file could not be opened. Try again in a moment.'))
   }

   const refresh = (accountIds?: string[]) =>
      source
         .refresh(accountIds)
         .then(({ started, skipped }) => {
            if (started > 0) {
               toast.success(`Reading ${started} ${started === 1 ? 'account' : 'accounts'}. It takes a few minutes.`, {
                  action: {
                     label: 'Reload',
                     onClick: reload,
                  },
               })
            }

            if (skipped.length > 0) {
               toast.warning(skipped.map(({ reason }) => reason).join(' '))
            }
         })
         .catch(() => toast.error('The messages could not be read. Try again in a moment.'))

   return (
      <Board
         accounts={loaded.accounts}
         sample={loaded.sample}
         canSend={loaded.canSend}
         canStart={loaded.canStart}
         loadRecipients={source.recipients}
         findRecipient={source.recipient}
         onRefresh={loaded.canRefresh ? refresh : undefined}
         onOpenFile={openFile}
         onFileUrl={source.fileLink ? fileUrl : undefined}
         api={api}
      />
   )
}
