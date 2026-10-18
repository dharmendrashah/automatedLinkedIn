import { DetailDrawers } from '@/components/details/detail-drawers'
import { useDetailDrawer } from '@/components/details/use-detail-drawer'
import { AddMemberDialog } from '@/components/lists/add-member-dialog'
import { InboxTable } from '@/components/lists/inbox-table'
import { ListNameDialog } from '@/components/lists/list-name-dialog'
import {
   FITS,
   INBOX_TABS,
   type InboxMember,
   type InboxView,
   type MemberStatus,
   isFit,
   isInboxView,
} from '@/components/lists/types'
import { useInboxActions } from '@/components/lists/use-inbox-actions'
import { useTriageKeys } from '@/components/lists/use-triage-keys'
import { Pager } from '@/components/links/pager'
import { PAGE_SIZE } from '@/components/links/use-list-state'
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { downloadFile } from '@/lib/download-file'
import { timeAgo } from '@/lib/time-ago'
import { Keyboard, ListChecks } from 'lucide-react'
import { useDeferredValue, useEffect, useState } from 'react'
import { Link } from 'react-router'

import { cn } from '@/lib/utils'

import { trpc } from '../trpc'

const ALL = 'all'
const BLOCKED = 'DO_NOT_CONTACT'
const TOP = 5

const KEYS = [
   ['J / K', 'Next or previous person'],
   ['C', 'Contacted'],
   ['R', 'Replied'],
   ['X', 'Not a fit'],
   ['U', 'Back to To do'],
   ['Y', 'Copy the message and open LinkedIn'],
   ['O', 'Open on LinkedIn'],
   ['Z', 'Undo the last change'],
   ['D', 'Do not contact (asks first)'],
] as const

const EMPTY: Record<InboxView, string> = {
   TODO: 'Nothing to do. New people arrive here when your workflows run.',
   CONTACTED: 'Nobody marked contacted yet.',
   REPLIED: 'No replies marked yet.',
   NOT_A_FIT: 'Nobody marked not a fit.',
   ALL: 'Nobody here yet. Let a workflow fill your lists, or add someone by hand.',
}

const someone = (members: InboxMember[]) =>
   members.length === 1 ? (members[0]?.name ?? members[0]?.slug ?? 'this person') : `${members.length} people`

// The leads inbox: everyone the owner's workflows found, across all lists, worked through one status at a time.
export const Lists = () => {
   const [view, setView] = useState<InboxView | typeof BLOCKED>('TODO')
   const [listId, setListId] = useState(ALL)
   const [fit, setFit] = useState(ALL)
   const [untouched, setUntouched] = useState(false)
   const [sort, setSort] = useState<'fit' | 'newest'>('fit')
   const [search, setSearch] = useState('')
   const [page, setPage] = useState(1)
   const [selected, setSelected] = useState<Set<string>>(new Set())
   const [blocking, setBlocking] = useState<InboxMember[] | null>(null)
   const [naming, setNaming] = useState<'create' | 'rename' | null>(null)
   const [deleting, setDeleting] = useState(false)
   const [help, setHelp] = useState(false)
   const deferredSearch = useDeferredValue(search)
   const drawer = useDetailDrawer()
   const actions = useInboxActions()
   const utils = trpc.useUtils()

   const inboxView = view === BLOCKED ? 'ALL' : view
   const lists = trpc.workflowList.lists.useQuery(undefined, { retry: false })
   const inbox = trpc.workflowList.inbox.useQuery(
      {
         view: inboxView,
         listId: listId === ALL ? undefined : listId,
         fit: isFit(fit) ? fit : undefined,
         untouched: untouched || undefined,
         search: deferredSearch.trim() || undefined,
         sort,
         page,
         pageSize: PAGE_SIZE,
      },
      {
         retry: false,
         placeholderData: previous => previous,
      }
   )
   const blocked = trpc.workflowList.doNotContactList.useQuery(undefined, { enabled: view === BLOCKED })
   const markSeen = trpc.workflowList.markSeen.useMutation()
   const refreshLists = () => {
      void utils.workflowList.lists.invalidate()
      void utils.workflowList.inbox.invalidate()
   }
   const createList = trpc.workflowList.createList.useMutation({
      onSuccess: list => {
         setListId(list.id)
         setNaming(null)
         refreshLists()
      },
   })
   const renameList = trpc.workflowList.renameList.useMutation({
      onSuccess: () => {
         setNaming(null)
         refreshLists()
      },
   })
   const deleteList = trpc.workflowList.deleteList.useMutation({
      onSuccess: () => {
         setListId(ALL)
         refreshLists()
      },
   })
   const exportCsv = trpc.workflowList.exportCsv.useMutation({
      onSuccess: ({ fileName, csv }) => downloadFile(fileName, csv, 'text/csv;charset=utf-8'),
   })

   // People added after the owner leaves are marked new on the next visit.
   useEffect(() => {
      const leave = () => markSeen.mutate()

      window.addEventListener('pagehide', leave)

      return () => {
         window.removeEventListener('pagehide', leave)
         leave()
      }
      // Only on leaving the page, not on every render.
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [])

   const data = inbox.data
   const items = data?.items ?? []
   const current = lists.data?.find(list => list.id === listId)
   const chosen = items.filter(({ id }) => selected.has(id))
   const index = items.findIndex(({ slug }) => slug === drawer.open?.slug)
   const active = index >= 0 ? items[index] : undefined
   // The five to start with: the best fits on the first page of To do.
   const topFive = new Set(
      view === 'TODO' && sort === 'fit' && page === 1 ? items.slice(0, TOP).map(({ id }) => id) : []
   )
   const filtersChange = (change: () => void) => {
      change()
      setPage(1)
      setSelected(new Set())
   }

   const open = (member: InboxMember | undefined) => (member ? drawer.show('person', member.slug) : undefined)
   const step = (by: number) => open(items[Math.min(items.length - 1, Math.max(0, index + by))])
   // After a status change the person may leave this view, so the next one is picked first.
   const setStatus = (member: InboxMember | undefined, status: MemberStatus) => {
      if (!member) return

      const next = items[index + 1] ?? items[index - 1]

      actions.changeStatus([member], status)

      if (inboxView !== 'ALL' && next) open(next)
   }

   useTriageKeys(
      {
         j: () => step(index < 0 ? 0 : 1),
         k: () => step(-1),
         c: () => setStatus(active, 'CONTACTED'),
         r: () => setStatus(active, 'REPLIED'),
         x: () => setStatus(active, 'NOT_A_FIT'),
         u: () => setStatus(active, 'NEW'),
         y: () => (active ? actions.message(active) : undefined),
         o: () => (active ? window.open(active.url, '_blank', 'noopener,noreferrer') : undefined),
         z: actions.undoLast,
         d: () => (active ? setBlocking([active]) : undefined),
         '?': () => setHelp(true),
      },
      view !== BLOCKED && !blocking && !help && !naming
   )

   const select = (ids: string[], on: boolean) =>
      setSelected(previous => {
         const next = new Set(previous)

         ids.forEach(id => (on ? next.add(id) : next.delete(id)))

         return next
      })
   const afterBulk = () => setSelected(new Set())

   return (
      <div className={cn('grid w-full gap-4 px-4 lg:px-6', drawer.open && 'xl:pr-[38rem]')}>
         <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1">
               <h2 className="text-lg font-semibold">Leads</h2>
               <p className="text-muted-foreground text-sm">
                  {data && data.newThisWeek > 0
                     ? `${data.newThisWeek} new ${data.newThisWeek === 1 ? 'person' : 'people'} this week. Start with the five marked below.`
                     : 'Everyone your workflows found, best fit first. Work through them and mark who you contacted.'}
               </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
               <Select value={listId} onValueChange={value => filtersChange(() => setListId(value))}>
                  <SelectTrigger className="w-56" aria-label="Which list">
                     <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                     <SelectItem value={ALL}>All lists</SelectItem>
                     {lists.data?.map(list => (
                        <SelectItem key={list.id} value={list.id}>
                           {list.name} ({list._count.members})
                        </SelectItem>
                     ))}
                  </SelectContent>
               </Select>
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <Button variant="outline">
                        <ListChecks />
                        Lists
                     </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                     <DropdownMenuItem onSelect={() => setNaming('create')}>New list</DropdownMenuItem>
                     <DropdownMenuItem disabled={!current} onSelect={() => setNaming('rename')}>
                        Rename this list
                     </DropdownMenuItem>
                     <DropdownMenuItem
                        disabled={!current || exportCsv.isPending}
                        onSelect={() => (current ? exportCsv.mutate({ id: current.id }) : undefined)}
                     >
                        Export this list as CSV
                     </DropdownMenuItem>
                     <DropdownMenuSeparator />
                     <DropdownMenuItem variant="destructive" disabled={!current} onSelect={() => setDeleting(true)}>
                        Delete this list
                     </DropdownMenuItem>
                  </DropdownMenuContent>
               </DropdownMenu>
               {current ? <AddMemberDialog listId={current.id} onAdded={refreshLists} /> : null}
               <Button variant="ghost" size="icon" aria-label="Keyboard shortcuts" onClick={() => setHelp(true)}>
                  <Keyboard />
               </Button>
            </div>
         </div>

         {lists.error || inbox.error ? (
            <p className="text-destructive text-sm">{(lists.error ?? inbox.error)?.message}</p>
         ) : null}

         <div className="flex flex-wrap items-center gap-2">
            <Tabs
               value={view}
               onValueChange={next =>
                  next === BLOCKED || isInboxView(next) ? filtersChange(() => setView(next)) : undefined
               }
            >
               <TabsList>
                  {Object.entries(INBOX_TABS).map(([value, title]) => (
                     <TabsTrigger key={value} value={value}>
                        {title}
                        {data && isInboxView(value) ? <span className="text-muted-foreground">{data.counts[value]}</span> : null}
                     </TabsTrigger>
                  ))}
                  <TabsTrigger value={BLOCKED}>
                     Do not contact
                     {data ? <span className="text-muted-foreground">{data.doNotContact}</span> : null}
                  </TabsTrigger>
               </TabsList>
            </Tabs>
            {view === BLOCKED ? null : (
               <>
                  <ToggleGroup
                     type="single"
                     variant="outline"
                     size="sm"
                     value={fit}
                     onValueChange={value => filtersChange(() => setFit(value || ALL))}
                     aria-label="Fit"
                  >
                     <ToggleGroupItem value={ALL}>Any fit</ToggleGroupItem>
                     {Object.entries(FITS).map(([value, { label }]) => (
                        <ToggleGroupItem key={value} value={value}>
                           {label}
                        </ToggleGroupItem>
                     ))}
                  </ToggleGroup>
                  <Button
                     variant={untouched ? 'secondary' : 'outline'}
                     size="sm"
                     aria-pressed={untouched}
                     onClick={() => filtersChange(() => setUntouched(!untouched))}
                  >
                     Untouched for 6 months
                  </Button>
                  <Select value={sort} onValueChange={value => filtersChange(() => setSort(value === 'newest' ? 'newest' : 'fit'))}>
                     <SelectTrigger size="sm" className="w-40" aria-label="Sort">
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        <SelectItem value="fit">Best fit first</SelectItem>
                        <SelectItem value="newest">Newest first</SelectItem>
                     </SelectContent>
                  </Select>
                  <Input
                     className="w-64"
                     aria-label="Search people"
                     placeholder="Search name, title, company or place"
                     value={search}
                     onChange={event => filtersChange(() => setSearch(event.target.value))}
                  />
               </>
            )}
         </div>

         {chosen.length > 0 ? (
            <div className="bg-muted/50 flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
               <span className="px-1 font-medium">{chosen.length} selected</span>
               <Button size="sm" variant="outline" onClick={() => (actions.changeStatus(chosen, 'CONTACTED'), afterBulk())}>
                  Mark contacted
               </Button>
               <Button size="sm" variant="outline" onClick={() => (actions.changeStatus(chosen, 'NOT_A_FIT'), afterBulk())}>
                  Not a fit
               </Button>
               <Select
                  value=""
                  onValueChange={id => {
                     const list = lists.data?.find(candidate => candidate.id === id)

                     if (list) {
                        actions.move(chosen, list)
                        afterBulk()
                     }
                  }}
               >
                  <SelectTrigger size="sm" className="w-40" aria-label="Move the selected people">
                     <SelectValue placeholder="Move to…" />
                  </SelectTrigger>
                  <SelectContent>
                     {lists.data?.map(list => (
                        <SelectItem key={list.id} value={list.id}>
                           {list.name}
                        </SelectItem>
                     ))}
                  </SelectContent>
               </Select>
               <Button size="sm" variant="outline" onClick={() => (actions.remove(chosen), afterBulk())}>
                  Remove
               </Button>
               <Button size="sm" variant="outline" className="text-destructive" onClick={() => setBlocking(chosen)}>
                  Do not contact
               </Button>
               <Button size="sm" variant="ghost" onClick={afterBulk}>
                  Clear
               </Button>
            </div>
         ) : null}

         {view === BLOCKED ? (
            <div className="grid gap-2 rounded-lg border p-4 text-sm">
               <p className="text-muted-foreground">
                  No workflow will ever add these people again, to any of your lists. This cannot be undone.
               </p>
               {blocked.data?.length === 0 ? <p>Nobody is on your do not contact list.</p> : null}
               <ul className="grid gap-1">
                  {blocked.data?.map(({ slug, createdAt }) => (
                     <li key={slug} className="flex justify-between gap-2">
                        <a
                           className="underline-offset-4 hover:underline"
                           href={`https://www.linkedin.com/in/${encodeURIComponent(slug)}`}
                           target="_blank"
                           rel="noreferrer noopener"
                        >
                           {slug}
                        </a>
                        <span className="text-muted-foreground">{timeAgo(createdAt)}</span>
                     </li>
                  ))}
               </ul>
            </div>
         ) : (
            <>
               <InboxTable
                  members={data?.items}
                  loading={inbox.isPending}
                  error={undefined}
                  view={inboxView}
                  seenAt={data?.seenAt ?? null}
                  selected={selected}
                  highlight={topFive}
                  activeSlug={drawer.open?.slug}
                  lists={lists.data ?? []}
                  emptyText={EMPTY[inboxView]}
                  onSelect={select}
                  onOpen={open}
                  onStatus={(member, status) => actions.changeStatus([member], status)}
                  onMessage={actions.message}
                  onMove={(member, list) => actions.move([member], list)}
                  onRemove={member => actions.remove([member])}
                  onBlock={member => setBlocking([member])}
               />
               {inboxView === 'TODO' && data?.total === 0 ? (
                  <p className="text-muted-foreground text-sm">
                     See your <Link className="underline underline-offset-4" to="/workflows">workflows</Link> to find more people.
                  </p>
               ) : null}
               <DetailDrawers kind="person" order={items.map(({ slug }) => slug)} docked />
               <Pager
                  total={data?.total ?? 0}
                  page={page}
                  onPage={next => {
                     setPage(next)
                     setSelected(new Set())
                  }}
                  noun={['person', 'people']}
               />
            </>
         )}

         <ListNameDialog
            open={naming !== null}
            title={naming === 'rename' ? 'Rename the list' : 'New list'}
            initial={naming === 'rename' ? (current?.name ?? '') : ''}
            pending={createList.isPending || renameList.isPending}
            error={naming === 'rename' ? renameList.error : createList.error}
            onSave={name =>
               naming === 'rename' && current
                  ? renameList.mutate({
                       id: current.id,
                       name,
                    })
                  : createList.mutate({ name })
            }
            onClose={() => {
               createList.reset()
               renameList.reset()
               setNaming(null)
            }}
         />

         <AlertDialog open={blocking !== null} onOpenChange={isOpen => (isOpen ? undefined : setBlocking(null))}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Never contact {someone(blocking ?? [])}?</AlertDialogTitle>
                  <AlertDialogDescription>
                     They are removed from all your lists, and no workflow will ever add them again. This cannot be undone.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                     onClick={() => {
                        void actions.block(blocking ?? [])
                        afterBulk()
                     }}
                  >
                     Do not contact
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>

         <AlertDialog open={deleting} onOpenChange={setDeleting}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Delete the list &quot;{current?.name}&quot;?</AlertDialogTitle>
                  <AlertDialogDescription>Everyone in it is removed too. This cannot be undone.</AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => (current ? deleteList.mutate({ id: current.id }) : undefined)}>
                     Delete list
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>

         <Dialog open={help} onOpenChange={setHelp}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>Keyboard shortcuts</DialogTitle>
               </DialogHeader>
               <ul className="grid gap-2 text-sm">
                  {KEYS.map(([key, what]) => (
                     <li key={key} className="flex justify-between gap-4">
                        <span>{what}</span>
                        <kbd className="bg-muted rounded px-1.5 font-mono text-xs">{key}</kbd>
                     </li>
                  ))}
               </ul>
            </DialogContent>
         </Dialog>
      </div>
   )
}
