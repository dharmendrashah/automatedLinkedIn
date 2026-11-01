import { Picture } from '@/components/details/detail-parts'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { timeAgo } from '@/lib/time-ago'
import { useFillHeight } from '@/lib/use-fill-height'
import {
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
import { CircleCheck, ExternalLink, FileText, Loader2, MessageSquare, ThumbsUp, Undo2 } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef } from 'react'

import { cn } from '@/lib/utils'

import { type Post } from './types'

import { LabelCell } from '../labels/label-cell'
import { type Selection } from '../links/use-selection'
import { POST_READ } from '../links/read-cost'
import { formatUsd } from '../workflows/types'
import { SortHeader } from '../table/sort-header'
import { type HiddenColumns } from '../table/use-hidden-columns'
import { ContactAvatar } from '../unibox/account-avatar'
import { PersonCard } from '../unibox/person-card'
import { postedText } from './post-row'
import { type PostSort } from './use-posts'

const ROW_HEIGHT = 73
const LOAD_AHEAD = 15

// The sort each sortable column asks brain for.
const SORT_OF: Record<string, PostSort['by']> = {
   post: 'postedAt',
   people: 'qualified',
   engagement: 'comments',
   createdAt: 'createdAt',
}

const CELL_CLASS: Record<string, string> = {
   select: 'w-0',
   post: 'min-w-80 max-w-[36rem]',
   people: 'whitespace-nowrap',
   engagement: 'whitespace-nowrap tabular-nums',
   labels: 'min-w-40',
   createdAt: 'whitespace-nowrap text-muted-foreground',
   readAt: 'whitespace-nowrap',
   actions: 'w-0',
}

const features = tableFeatures({
   rowSortingFeature,
   columnVisibilityFeature,
})
const column = createColumnHelper<typeof features, Post>()

const linkOf = (post: Post) => post.expandedUrl ?? post.url

// The link without its scheme, for a post not read yet.
const shortLink = (post: Post) => linkOf(post).replace(/^https:\/\/(www\.)?/, '')

const nameOf = (post: Post) => post.card?.author.name ?? shortLink(post)

const Muted = ({ children }: { children: ReactNode }) => <span className="text-muted-foreground">{children}</span>

// Clicks inside stay there and do not open the row.
const Stop = ({ children }: { children: ReactNode }) => (
   // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- only stops the row's click
   <span className="contents" onClick={event => event.stopPropagation()}>
      {children}
   </span>
)

const PostCell = ({ post }: { post: Post }) => {
   const { card } = post

   if (!card) {
      return (
         <div className="grid min-w-0">
            <span className="truncate font-medium">{shortLink(post)}</span>
            <span className="text-muted-foreground text-xs">
               Not read yet · Get details for {formatUsd(POST_READ.micros)}
            </span>
         </div>
      )
   }

   const posted = postedText(card.postedAt)

   return (
      <div className="flex min-w-0 items-start gap-3">
         <Picture
            name={card.author.name ?? 'Post'}
            image={card.author.avatar}
            square={card.author.isCompany}
            className={cn('size-10 shrink-0 border text-xs', card.author.isCompany && 'rounded-md')}
         />
         <div className="grid min-w-0 gap-0.5">
            <span className="truncate text-sm">
               <span className="font-medium">{card.author.name ?? 'Unknown author'}</span>
               {posted ? <span className="text-muted-foreground"> · {posted}</span> : null}
            </span>
            {card.text ? (
               <span className="text-muted-foreground line-clamp-2 text-xs whitespace-normal" title={card.text}>
                  {card.text}
               </span>
            ) : null}
         </div>
      </div>
   )
}

// Qualified of found, then up to three faces with a short look on hover.
const PeopleCell = ({ people, onPerson }: { people: Post['people']; onPerson: (slug: string) => void }) =>
   people.found === 0 ? (
      <Muted>—</Muted>
   ) : (
      <span className="flex items-center gap-2">
         <Stop>
            <span className="flex -space-x-2">
               {people.first.map(person => (
                  <PersonCard key={person.slug} slug={person.slug} onOpen={onPerson}>
                     <ContactAvatar name={person.name ?? person.slug} size="sm" className="ring-background ring-2" />
                  </PersonCard>
               ))}
            </span>
         </Stop>
         <span className="grid text-sm leading-tight tabular-nums">
            {people.qualified} qualified
            <span className="text-muted-foreground text-xs">of {people.found} found</span>
         </span>
      </span>
   )

type Handlers = {
   selection: Selection
   busyId: string | undefined
   onTag: (tag: string) => void
   saveTags: (post: Post, tags: string[]) => Promise<unknown>
   onPerson: (slug: string) => void
   onToggle: (post: Post) => void
}

const columnsOf = (ids: string[], handlers: Handlers) =>
   column.columns([
      column.display({
         id: 'select',
         header: () => (
            <Checkbox
               aria-label="Select every post shown"
               checked={ids.length > 0 && ids.every(id => handlers.selection.selected.has(id))}
               onCheckedChange={checked => handlers.selection.select(ids, checked === true)}
            />
         ),
         cell: ({ row }) => (
            <Stop>
               <Checkbox
                  aria-label={`Select ${nameOf(row.original)}`}
                  checked={handlers.selection.selected.has(row.original.id)}
                  onCheckedChange={checked => handlers.selection.select([row.original.id], checked === true)}
               />
            </Stop>
         ),
      }),
      column.accessor(row => row.card?.postedAt ?? '', {
         id: 'post',
         header: ({ column: header }) => (
            <SortHeader label="Post" sorted={header.getIsSorted()} onClick={header.getToggleSortingHandler()} />
         ),
         sortDescFirst: true,
         cell: ({ row }) => <PostCell post={row.original} />,
      }),
      column.accessor(row => row.people.qualified, {
         id: 'people',
         header: ({ column: header }) => (
            <SortHeader
               label="People found"
               sorted={header.getIsSorted()}
               onClick={header.getToggleSortingHandler()}
            />
         ),
         sortDescFirst: true,
         cell: ({ row }) => <PeopleCell people={row.original.people} onPerson={handlers.onPerson} />,
      }),
      column.accessor(row => row.card?.comments ?? 0, {
         id: 'engagement',
         header: ({ column: header }) => (
            <SortHeader label="Engagement" sorted={header.getIsSorted()} onClick={header.getToggleSortingHandler()} />
         ),
         sortDescFirst: true,
         cell: ({ row }) =>
            row.original.card ? (
               <span className="flex items-center gap-3">
                  <span className="flex items-center gap-1" title="Reactions">
                     <ThumbsUp className="text-muted-foreground size-3.5" aria-label="Reactions" />
                     {row.original.card.reactions?.toLocaleString() ?? '—'}
                  </span>
                  <span className="flex items-center gap-1" title="Comments">
                     <MessageSquare className="text-muted-foreground size-3.5" aria-label="Comments" />
                     {row.original.card.comments?.toLocaleString() ?? '—'}
                  </span>
               </span>
            ) : (
               <Muted>—</Muted>
            ),
      }),
      column.display({
         id: 'labels',
         header: 'Labels',
         cell: ({ row }) => (
            <Stop>
               <LabelCell
                  tags={row.original.tags}
                  kind="posts"
                  name={nameOf(row.original)}
                  save={tags => handlers.saveTags(row.original, tags)}
                  onFilter={handlers.onTag}
               />
            </Stop>
         ),
      }),
      column.accessor('createdAt', {
         header: ({ column: header }) => (
            <SortHeader label="Added" sorted={header.getIsSorted()} onClick={header.getToggleSortingHandler()} />
         ),
         sortDescFirst: true,
         cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(),
      }),
      column.display({
         id: 'readAt',
         header: 'Last read',
         cell: ({ row }) =>
            row.original.readAt ? (
               <span title={new Date(row.original.readAt).toLocaleString()}>{timeAgo(row.original.readAt)}</span>
            ) : (
               <Muted>Not read</Muted>
            ),
      }),
      column.display({
         id: 'actions',
         header: () => <span className="sr-only">Actions</span>,
         cell: ({ row }) => {
            const post = row.original
            const done = post.status === 'PROCESSED'
            const busy = handlers.busyId === post.id

            return (
               <Stop>
                  <span className="flex items-center justify-end gap-1">
                     <Tooltip>
                        <TooltipTrigger asChild>
                           <Button
                              variant="ghost"
                              size="icon"
                              disabled={busy}
                              aria-label={done ? `Move ${nameOf(post)} back to work` : `Mark ${nameOf(post)} done`}
                              onClick={() => handlers.onToggle(post)}
                           >
                              {busy ? <Loader2 className="animate-spin" /> : done ? <Undo2 /> : <CircleCheck />}
                           </Button>
                        </TooltipTrigger>
                        <TooltipContent>{done ? 'Back to work' : 'Mark done'}</TooltipContent>
                     </Tooltip>
                     <Tooltip>
                        <TooltipTrigger asChild>
                           <Button variant="ghost" size="icon" asChild>
                              <a
                                 href={linkOf(post)}
                                 target="_blank"
                                 rel="noreferrer noopener"
                                 aria-label={`Open ${nameOf(post)} on LinkedIn`}
                              >
                                 <ExternalLink />
                              </a>
                           </Button>
                        </TooltipTrigger>
                        <TooltipContent>Open on LinkedIn</TooltipContent>
                     </Tooltip>
                  </span>
               </Stop>
            )
         },
      }),
   ])

type Props = Handlers & {
   posts: Post[]
   loading: boolean
   error: string | undefined
   empty: string
   selectedSlug: string | null
   sort: PostSort | undefined
   hidden: HiddenColumns
   hasMore: boolean
   loadingMore: boolean
   onSort: (sort: PostSort | undefined) => void
   onMore: () => void
   onOpen: (post: Post) => void
}

// The Posts table (TanStack Table), drawn like the Companies one: only the visible rows, the next page near the end,
// hideable columns. Brain sorts and filters.
export const PostsTable = ({
   posts,
   loading,
   error,
   empty,
   selectedSlug,
   sort,
   hidden,
   hasMore,
   loadingMore,
   onSort,
   onMore,
   onOpen,
   ...handlers
}: Props) => {
   const scroller = useRef<HTMLDivElement>(null)
   const ids = useMemo(() => posts.map(({ id }) => id), [posts])
   // Rebuilt every render on purpose: the cells read the selection and the busy row.
   const columns = columnsOf(ids, handlers)
   const sortedColumn = Object.entries(SORT_OF).find(([, by]) => by === sort?.by)?.[0]
   const sorting: SortingState =
      sort && sortedColumn
         ? [
              {
                 id: sortedColumn,
                 desc: sort.desc,
              },
           ]
         : []
   const table = useTable({
      features,
      data: posts,
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
         const by = next ? SORT_OF[next.id] : undefined

         onSort(
            next && by
               ? {
                    by,
                    desc: next.desc,
                 }
               : undefined
         )
      },
   })
   // oxlint-disable-next-line react/incompatible-library -- the virtualizer's functions are used here and as the rows' ref, never memoised
   const virtualizer = useVirtualizer({
      count: posts.length,
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
      if (hasMore && !loadingMore && last >= posts.length - LOAD_AHEAD) {
         onMore()
      }
   }, [hasMore, loadingMore, last, posts.length, onMore])

   const message = (content: ReactNode, className = 'text-muted-foreground') => (
      <tr>
         <td colSpan={width} className={cn('h-32 p-4 text-center text-sm', className)}>
            {content}
         </td>
      </tr>
   )

   return (
      <div ref={scroller} className="bg-card relative min-h-64 overflow-auto rounded-xl border" style={{ height }}>
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
               {loading
                  ? Array.from({ length: 5 }, (_, index) => (
                       <tr key={index}>
                          <td colSpan={width} className="px-3 py-2">
                             <Skeleton className="h-12 w-full" />
                          </td>
                       </tr>
                    ))
                  : null}
               {error ? message(error, 'text-destructive') : null}
               {!loading && !error && posts.length === 0
                  ? message(
                       <span className="inline-flex flex-col items-center gap-2">
                          <FileText className="size-6" />
                          {empty}
                       </span>
                    )
                  : null}
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
                        aria-label={`Open ${nameOf(row.original)}`}
                        data-state={row.original.slug === selectedSlug ? 'selected' : undefined}
                        className="cursor-pointer"
                        onClick={() => onOpen(row.original)}
                        onKeyDown={event => {
                           if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                              event.preventDefault()
                              onOpen(row.original)
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
                        Loading more posts…
                     </td>
                  </tr>
               ) : null}
            </TableBody>
         </table>
      </div>
   )
}
