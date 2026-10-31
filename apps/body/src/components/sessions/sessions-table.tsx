import { Photo } from '@/components/photo'
import { Button } from '@/components/ui/button'
import {
   DropdownMenu,
   DropdownMenuCheckboxItem,
   DropdownMenuContent,
   DropdownMenuLabel,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { flagOf } from '@/lib/country-flag'
import { useFillHeight } from '@/lib/use-fill-height'
import {
   type ColumnVisibilityState,
   FlexRender,
   type SortingState,
   type Updater,
   columnVisibilityFeature,
   createColumnHelper,
   rowSortingFeature,
   tableFeatures,
   useTable,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
   ArrowDown,
   ArrowUp,
   ArrowUpDown,
   Building2,
   Columns3,
   Eye,
   FileText,
   Film,
   Globe,
   Hand,
   Images,
   KeyRound,
   ListTree,
   Loader2,
   LogIn,
   Mail,
   MessageSquareReply,
   Network,
   PenLine,
   RotateCcw,
   ScrollText,
   ShieldCheck,
   Timer,
   UserPlus,
   UserRound,
   Users,
   Video,
   Workflow,
} from 'lucide-react'
import { type ComponentType, useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

import { type SessionRow } from './types'

import { type Catalog, actionLabel, formatDuration, proxyLabel, timeAgo } from './describe'
import { SessionStatusBadge } from './session-status-badge'
import { type SessionSort } from './use-sessions'

type Icon = ComponentType<{ className?: string }>

// What each task does, at a glance; a task not listed here gets the generic icon.
const TASK_ICONS: Record<string, Icon> = {
   'linkedin-messages': Mail,
   'linkedin-reply': MessageSquareReply,
   'linkedin-invite': UserPlus,
   'linkedin-invitations': Users,
   'linkedin-connections': Network,
   'linkedin-browse': Eye,
   'linkedin-login': LogIn,
   'linkedin-profile': UserRound,
   'linkedin-post': PenLine,
   'linkedin-read-post': FileText,
   'linkedin-company': Building2,
   'browser-detection': ShieldCheck,
}

const TRIGGER_ICONS: Record<string, { icon: Icon; word: string }> = {
   manual: {
      icon: Hand,
      word: 'Started by hand',
   },
   automatic: {
      icon: Timer,
      word: 'Started automatically',
   },
   retry: {
      icon: RotateCcw,
      word: 'A retry',
   },
}

const FILE_ICONS: Array<{ kind: string; icon: Icon; word: string }> = [
   {
      kind: 'video',
      icon: Film,
      word: 'Video',
   },
   {
      kind: 'screenshot',
      icon: Images,
      word: 'Screenshots',
   },
   {
      kind: 'log',
      icon: ScrollText,
      word: 'Logs',
   },
   {
      kind: 'network',
      icon: Globe,
      word: 'Network',
   },
   {
      kind: 'timeline',
      icon: ListTree,
      word: 'Steps',
   },
   {
      kind: 'session',
      icon: KeyRound,
      word: 'Saved session',
   },
]

const COLUMN_WORDS: Record<string, string> = {
   result: 'Result',
   action: 'Action',
   account: 'Account',
   trigger: 'Started by',
   proxy: 'Proxy',
   detail: 'Detail',
   startedAt: 'Started',
   durationMs: 'Took',
   files: 'Files',
}

const CELL_CLASS: Record<string, string> = {
   result: 'w-0',
   action: 'max-w-64',
   account: 'max-w-64',
   trigger: 'w-0',
   proxy: 'max-w-48',
   detail: 'max-w-96',
   startedAt: 'whitespace-nowrap',
   durationMs: 'text-right tabular-nums whitespace-nowrap',
   files: 'w-0',
}

const SORTS: Array<SessionSort['by']> = ['startedAt', 'durationMs']
const ROW_HEIGHT = 57
const LOAD_AHEAD = 15
const HIDDEN_KEY = 'sessions.hiddenColumns'

const features = tableFeatures({
   rowSortingFeature,
   columnVisibilityFeature,
})
const column = createColumnHelper<typeof features, SessionRow>()

const initials = (text: string) =>
   text
      .split(/[\s@.]+/)
      .slice(0, 2)
      .map(word => word[0] ?? '')
      .join('')
      .toUpperCase()

const SortHeader = ({
   label,
   sorted,
   onClick,
}: {
   label: string
   sorted: false | 'asc' | 'desc'
   onClick?: (event: unknown) => void
}) => {
   const Arrow = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown

   return (
      <button
         type="button"
         className="hover:text-foreground -ml-1 inline-flex items-center gap-1 rounded px-1"
         aria-label={`Sort by ${label.toLowerCase()}`}
         onClick={onClick}
      >
         {label}
         <Arrow className={cn('size-3.5', !sorted && 'opacity-40')} />
      </button>
   )
}

const columnsOf = (catalog: Catalog | undefined, onOpen: (id: string) => void) =>
   column.columns([
      column.display({
         id: 'result',
         header: 'Result',
         cell: ({ row }) => (
            <SessionStatusBadge
               status={row.original.status}
               noAnswer={row.original.noAnswer}
               kind={row.original.kind}
               task={row.original.task}
               verdict={row.original.verdict}
            />
         ),
      }),
      column.display({
         id: 'action',
         header: 'Action',
         cell: ({ row }) => {
            const { task, taskVersion } = row.original
            const Icon =
               (task ? TASK_ICONS[task] : undefined) ?? (row.original.kind === 'VALIDATE_ACCOUNT' ? LogIn : Workflow)

            return (
               <span
                  className="flex items-center gap-2 font-medium"
                  title={taskVersion ? `Task version ${taskVersion}` : undefined}
               >
                  <Icon className="text-muted-foreground size-4 shrink-0" />
                  <span className="truncate">{actionLabel(row.original, catalog)}</span>
               </span>
            )
         },
      }),
      column.display({
         id: 'account',
         header: 'Account',
         cell: ({ row }) => {
            const { email, displayName, imageUrl } = row.original.linkedInAccount

            return (
               <span className="flex min-w-0 items-center gap-2">
                  <span className="bg-muted relative grid size-7 shrink-0 place-items-center overflow-hidden rounded-full text-[10px] font-medium">
                     {initials(displayName ?? email)}
                     <Photo url={imageUrl ?? undefined} />
                  </span>
                  <span className="grid min-w-0">
                     <span className="truncate">{displayName ?? email}</span>
                     {displayName ? <span className="text-muted-foreground truncate text-xs">{email}</span> : null}
                  </span>
               </span>
            )
         },
      }),
      column.display({
         id: 'trigger',
         header: 'Started by',
         cell: ({ row }) => {
            const { trigger, retryOfId, retriesCount } = row.original
            const known = trigger ? TRIGGER_ICONS[trigger] : undefined

            return (
               <span className="text-muted-foreground flex items-center gap-1.5">
                  {known ? (
                     <span title={known.word} aria-label={known.word} role="img">
                        <known.icon className="size-4" />
                     </span>
                  ) : null}
                  {retryOfId ? (
                     <button
                        type="button"
                        className="text-xs underline-offset-4 hover:underline"
                        onClick={event => {
                           event.stopPropagation()
                           onOpen(retryOfId)
                        }}
                     >
                        the run it retried
                     </button>
                  ) : null}
                  {retriesCount > 0 ? (
                     <span className="text-xs" title="Times this run was retried">
                        {retriesCount}×
                     </span>
                  ) : null}
               </span>
            )
         },
      }),
      column.display({
         id: 'proxy',
         header: 'Proxy',
         cell: ({ row }) => {
            const { proxyCountry, proxyProtocol } = row.original
            const flag = flagOf(proxyCountry)

            return (
               <span className="grid" title={proxyProtocol ?? undefined}>
                  <span className="font-mono text-xs">{proxyLabel(row.original)}</span>
                  {proxyCountry ? (
                     <span className="text-muted-foreground text-xs">
                        {flag ? `${flag} ` : ''}
                        {proxyCountry}
                     </span>
                  ) : null}
               </span>
            )
         },
      }),
      column.display({
         id: 'detail',
         header: 'Detail',
         cell: ({ row }) =>
            row.original.message ? (
               <span
                  className="text-muted-foreground line-clamp-2 text-xs whitespace-normal"
                  title={row.original.message}
               >
                  {row.original.message}
               </span>
            ) : null,
      }),
      column.accessor('startedAt', {
         header: ({ column: header }) => (
            <SortHeader label="Started" sorted={header.getIsSorted()} onClick={header.getToggleSortingHandler()} />
         ),
         sortDescFirst: true,
         cell: ({ row }) => (
            <span title={new Date(row.original.startedAt).toLocaleString()}>
               {timeAgo(new Date(row.original.startedAt))}
            </span>
         ),
      }),
      column.accessor('durationMs', {
         header: ({ column: header }) => (
            <SortHeader label="Took" sorted={header.getIsSorted()} onClick={header.getToggleSortingHandler()} />
         ),
         sortDescFirst: true,
         cell: ({ row }) => formatDuration(row.original.durationMs),
      }),
      column.display({
         id: 'files',
         header: 'Files',
         cell: ({ row }) => {
            const { files, recordingExpired } = row.original

            return (
               <span
                  className={cn('text-muted-foreground flex gap-1', recordingExpired && 'opacity-40')}
                  title={recordingExpired ? 'These files have expired' : undefined}
               >
                  {FILE_ICONS.filter(({ kind }) => files.includes(kind)).map(({ kind, icon: FileIcon, word }) => (
                     <span key={kind} title={word} aria-label={word} role="img">
                        <FileIcon className="size-3.5" />
                     </span>
                  ))}
               </span>
            )
         },
      }),
   ])

const readHidden = (): ColumnVisibilityState => {
   try {
      const parsed: unknown = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '{}')

      return parsed && typeof parsed === 'object'
         ? Object.fromEntries(Object.entries(parsed).filter(([, shown]) => shown === false))
         : {}
   } catch {
      return {}
   }
}

type Props = {
   rows: SessionRow[]
   catalog: Catalog | undefined
   loading: boolean
   error: string | undefined
   empty: string
   selectedId: string | null
   sort: SessionSort | undefined
   hasMore: boolean
   loadingMore: boolean
   onOpen: (id: string) => void
   onSort: (sort: SessionSort | undefined) => void
   onMore: () => void
   // Whether the list is scrolled to its top, where new runs may simply appear.
   onTop: (atTop: boolean) => void
}

// The Sessions table (TanStack Table): only the visible rows are drawn (TanStack Virtual), older pages load near the end, and
// the owner can hide columns (kept in this browser). Brain sorts and filters.
export const SessionsTable = ({
   rows,
   catalog,
   loading,
   error,
   empty,
   selectedId,
   sort,
   hasMore,
   loadingMore,
   onOpen,
   onSort,
   onMore,
   onTop,
}: Props) => {
   const scroller = useRef<HTMLDivElement>(null)
   const [hidden, setHidden] = useState<ColumnVisibilityState>(readHidden)
   const columns = useMemo(() => columnsOf(catalog, onOpen), [catalog, onOpen])
   const sorting: SortingState = sort
      ? [
           {
              id: sort.by,
              desc: sort.desc,
           },
        ]
      : []
   const table = useTable({
      features,
      data: rows,
      columns,
      getRowId: row => row.id,
      state: {
         sorting,
         columnVisibility: hidden,
      },
      manualSorting: true,
      enableSortingRemoval: true,
      onSortingChange: (updater: Updater<SortingState>) => {
         const [next] = typeof updater === 'function' ? updater(sorting) : updater
         const by = SORTS.find(item => item === next?.id)

         onSort(
            next && by
               ? {
                    by,
                    desc: next.desc,
                 }
               : undefined
         )
      },
      onColumnVisibilityChange: (updater: Updater<ColumnVisibilityState>) => {
         const next = typeof updater === 'function' ? updater(hidden) : updater

         localStorage.setItem(HIDDEN_KEY, JSON.stringify(next))
         setHidden(next)
      },
   })
   // oxlint-disable-next-line react/incompatible-library -- the virtualizer's functions are used here and as the rows' ref, never memoised
   const virtualizer = useVirtualizer({
      count: rows.length,
      getScrollElement: () => scroller.current,
      estimateSize: () => ROW_HEIGHT,
      overscan: 12,
   })
   const items = virtualizer.getVirtualItems()
   const last = items.at(-1)?.index ?? -1
   const top = items[0]?.start ?? 0
   const bottom = virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0)
   const width = table.getVisibleLeafColumns().length
   const height = useFillHeight(scroller)

   useEffect(() => {
      if (hasMore && !loadingMore && last >= rows.length - LOAD_AHEAD) {
         onMore()
      }
   }, [hasMore, loadingMore, last, rows.length, onMore])

   const message = (text: string, className = 'text-muted-foreground') => (
      <tr>
         <td colSpan={width} className={cn('h-28 p-4 text-center text-sm', className)}>
            {text}
         </td>
      </tr>
   )

   return (
      <div className="grid gap-2">
         <div className="flex justify-end">
            <DropdownMenu>
               <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                     <Columns3 />
                     Columns
                  </Button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Show columns</DropdownMenuLabel>
                  {table
                     .getAllLeafColumns()
                     .filter(({ id }) => id !== 'result')
                     .map(each => (
                        <DropdownMenuCheckboxItem
                           key={each.id}
                           checked={each.getIsVisible()}
                           onCheckedChange={shown => each.toggleVisibility(shown === true)}
                           onSelect={event => event.preventDefault()}
                        >
                           {COLUMN_WORDS[each.id] ?? each.id}
                        </DropdownMenuCheckboxItem>
                     ))}
               </DropdownMenuContent>
            </DropdownMenu>
         </div>
         <div
            ref={scroller}
            className="bg-card relative min-h-64 overflow-auto rounded-xl border"
            style={{ height }}
            onScroll={event => onTop(event.currentTarget.scrollTop < 8)}
         >
            <table className="w-full caption-bottom text-sm">
               <TableHeader className="bg-muted sticky top-0 z-10">
                  {table.getHeaderGroups().map(group => (
                     <TableRow key={group.id}>
                        {group.headers.map(header => (
                           <TableHead key={header.id} className={CELL_CLASS[header.column.id]}>
                              {header.isPlaceholder ? null : <FlexRender header={header} />}
                           </TableHead>
                        ))}
                     </TableRow>
                  ))}
               </TableHeader>
               <TableBody>
                  {loading ? (
                     <tr>
                        <td colSpan={width} className="p-3">
                           <Skeleton className="h-8 w-full" />
                        </td>
                     </tr>
                  ) : null}
                  {error ? message(error, 'text-destructive') : null}
                  {!loading && !error && rows.length === 0 ? message(empty) : null}
                  {top > 0 ? (
                     <tr aria-hidden style={{ height: top }}>
                        <td colSpan={width} />
                     </tr>
                  ) : null}
                  {items.map(item => {
                     const row = table.getRowModel().rows[item.index]

                     if (!row) {
                        return null
                     }

                     return (
                        <TableRow
                           key={row.id}
                           data-index={item.index}
                           ref={virtualizer.measureElement}
                           tabIndex={0}
                           aria-label={`Open the session from ${new Date(row.original.startedAt).toLocaleString()}`}
                           data-state={row.id === selectedId ? 'selected' : undefined}
                           className="cursor-pointer"
                           onClick={() => onOpen(row.id)}
                           onKeyDown={event => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                 event.preventDefault()
                                 onOpen(row.id)
                              }
                           }}
                        >
                           {row.getVisibleCells().map(cell => (
                              <TableCell key={cell.id} className={CELL_CLASS[cell.column.id]}>
                                 <FlexRender cell={cell} />
                              </TableCell>
                           ))}
                        </TableRow>
                     )
                  })}
                  {bottom > 0 ? (
                     <tr aria-hidden style={{ height: bottom }}>
                        <td colSpan={width} />
                     </tr>
                  ) : null}
                  {loadingMore ? (
                     <tr>
                        <td colSpan={width} className="text-muted-foreground p-3 text-center text-sm">
                           <Loader2 className="mr-2 inline size-4 animate-spin" />
                           Loading older sessions…
                        </td>
                     </tr>
                  ) : null}
               </TableBody>
            </table>
         </div>
         {rows.length === 0 && !loading ? null : (
            <p className="text-muted-foreground flex items-center gap-1 text-xs">
               <Video className="size-3.5" />
               Recordings are kept for a while, then expire; the files column greys out when they have.
            </p>
         )}
      </div>
   )
}
