import { DetailDrawers } from '@/components/details/detail-drawers'
import { useDetailDrawer } from '@/components/details/use-detail-drawer'
import { LinkBulkBar } from '@/components/links/bulk-bar'
import { ListToolbar } from '@/components/links/list-toolbar'
import { POST_READ, readResultLine } from '@/components/links/read-cost'
import { ReadManyButton } from '@/components/links/read-many-button'
import { useListState } from '@/components/links/use-list-state'
import { useSelection } from '@/components/links/use-selection'
import { AddPostsDialog, POST_FILLS } from '@/components/posts/add-posts-dialog'
import { PostsTable } from '@/components/posts/posts-table'
import {
   POST_COLUMNS,
   POST_HIDDEN_BY_DEFAULT,
   POST_SORTS,
   type PostSort,
   usePosts,
} from '@/components/posts/use-posts'
import { ColumnsMenu } from '@/components/table/columns-menu'
import { readSort, writeSort } from '@/components/table/sort-param'
import { useHiddenColumns } from '@/components/table/use-hidden-columns'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { readableError } from '@/lib/trpc-error'
import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { type Post, type PostStatus } from '@/components/posts/types'

import { trpc } from '../trpc'

const READ_FILTERS = {
   any: 'Read or not',
   read: 'Read',
   unread: 'Not read yet',
} as const

type ReadFilter = keyof typeof READ_FILTERS

const isReadFilter = (value: string | null): value is ReadFilter => value !== null && value in READ_FILTERS

const EMPTY = {
   UNPROCESSED: 'No posts to work through. Add posts to find who engages with them.',
   PROCESSED: 'No posts done yet. A post is done when you mark it, or when a workflow marks it done.',
} as const

// The posts to mine for commenters and reactors (.plan/posts-page-redesign.md): To work and Done tabs, rows from the
// post read, the people found from each, and bulk reads with the price first.
export const Posts = () => {
   const utils = trpc.useUtils()
   const state = useListState()
   const selection = useSelection()
   const drawer = useDetailDrawer()
   const [params, setParams] = useSearchParams()
   const [hidden, setHidden] = useHiddenColumns('posts.hiddenColumns', POST_HIDDEN_BY_DEFAULT)

   const status: PostStatus = params.get('tab') === 'done' ? 'PROCESSED' : 'UNPROCESSED'
   const readParam = params.get('read')
   const read: ReadFilter = isReadFilter(readParam) ? readParam : 'any'
   const sortParam = params.get('sort')
   const sort = useMemo(() => readSort(sortParam, POST_SORTS), [sortParam])
   const { search, tags, tagMatch, addedSince } = state.query
   const { list, rows, total } = usePosts({
      search,
      tags,
      tagMatch,
      addedSince,
      status,
      ...(read !== 'any' && { read: read === 'read' ? ('READ' as const) : ('UNREAD' as const) }),
      ...(sort && { sort }),
   })
   const tabCounts = trpc.linkedInPost.counts.useQuery(undefined, { retry: false })

   const setParam = (key: string, value: string | null) =>
      setParams(
         current => {
            const next = new URLSearchParams(current)

            if (value) {
               next.set(key, value)
            } else {
               next.delete(key)
            }

            return next
         },
         { replace: true }
      )

   const refresh = () => {
      void utils.linkedInPost.list.invalidate()
      void utils.linkedInPost.counts.invalidate()
      void utils.label.list.invalidate()
   }
   const update = trpc.linkedInPost.update.useMutation({ onSuccess: refresh })
   const labelMany = trpc.linkedInPost.labelMany.useMutation({ onSuccess: refresh })
   const setStatusMany = trpc.linkedInPost.setStatusMany.useMutation({
      onSuccess: () => {
         selection.clear()
         refresh()
      },
   })
   const readMany = trpc.linkedInPost.readMany.useMutation({
      onSuccess: totals => {
         toast.success(readResultLine(POST_READ, totals))
         refresh()
      },
      onError: error => toast.error(readableError(error)),
   })
   // Separate from `update`, so saving labels does not show the row as busy.
   const updateTags = trpc.linkedInPost.update.useMutation()
   const saveTags = async (post: Post, tags: string[]) => {
      await updateTags.mutateAsync({
         id: post.id,
         tags,
      })
      await Promise.all([utils.linkedInPost.list.invalidate(), utils.label.list.invalidate()])
   }
   const more = useCallback(() => void list.fetchNextPage(), [list])

   const other: PostStatus = status === 'PROCESSED' ? 'UNPROCESSED' : 'PROCESSED'
   const busyId = update.isPending ? update.variables?.id : undefined
   const actionError = [update, labelMany, setStatusMany].find(action => action.error)?.error?.message
   const picked = rows.filter(({ id }) => selection.selected.has(id))
   const filtered = Boolean(search || tags || addedSince || read !== 'any')
   const counts = tabCounts.data

   return (
      <div className="grid w-full gap-4 px-4 lg:px-6">
         <Tabs
            value={status}
            onValueChange={tab => {
               selection.clear()
               setParam('tab', tab === 'PROCESSED' ? 'done' : null)
            }}
         >
            <TabsList>
               <TabsTrigger value="UNPROCESSED">
                  To work
                  {counts ? <span className="text-muted-foreground tabular-nums">{counts.toWork}</span> : null}
               </TabsTrigger>
               <TabsTrigger value="PROCESSED">
                  Done
                  {counts ? <span className="text-muted-foreground tabular-nums">{counts.done}</span> : null}
               </TabsTrigger>
            </TabsList>
         </Tabs>

         <ListToolbar state={state} kind="posts" searchLabel="Search posts" searchPlaceholder="Search author, text or link">
            <Select value={read} onValueChange={value => setParam('read', value === 'any' ? null : value)}>
               <SelectTrigger className="w-40" aria-label="Filter by read">
                  <SelectValue />
               </SelectTrigger>
               <SelectContent>
                  {Object.entries(READ_FILTERS).map(([value, label]) => (
                     <SelectItem key={value} value={value}>
                        {label}
                     </SelectItem>
                  ))}
               </SelectContent>
            </Select>
            <div className="ml-auto flex items-center gap-2">
               <ColumnsMenu columns={POST_COLUMNS} hidden={hidden} onChange={setHidden} />
               <AddPostsDialog onShow={label => state.setTags([label])} />
            </div>
         </ListToolbar>

         {actionError ? <p className="text-destructive text-sm">{actionError}</p> : null}

         <LinkBulkBar kind="posts" selection={selection} labelMany={labelMany}>
            <ReadManyButton
               noun={POST_READ}
               fills={POST_FILLS}
               picked={picked}
               pending={readMany.isPending}
               onRead={ids => readMany.mutate({ ids })}
            />
            <Button
               size="sm"
               variant="outline"
               disabled={setStatusMany.isPending}
               onClick={() =>
                  setStatusMany.mutate({
                     ids: [...selection.selected],
                     status: other,
                  })
               }
            >
               {other === 'PROCESSED' ? 'Mark done' : 'Back to work'}
            </Button>
         </LinkBulkBar>

         <PostsTable
            posts={rows}
            loading={list.isPending}
            error={list.error?.message}
            empty={filtered ? 'No posts match these filters.' : EMPTY[status]}
            selectedSlug={drawer.open?.kind === 'post' ? drawer.open.slug : null}
            sort={sort}
            hidden={hidden}
            hasMore={Boolean(list.hasNextPage)}
            loadingMore={list.isFetchingNextPage}
            onSort={(next: PostSort | undefined) => setParam('sort', writeSort(next))}
            onMore={more}
            onOpen={post => drawer.show('post', post.slug)}
            selection={selection}
            busyId={busyId}
            onTag={state.addTag}
            saveTags={saveTags}
            onPerson={slug => drawer.show('person', slug)}
            onToggle={post =>
               update.mutate({
                  id: post.id,
                  status: post.status === 'PROCESSED' ? 'UNPROCESSED' : 'PROCESSED',
               })
            }
         />

         <p className="text-muted-foreground text-sm">
            {list.isPending ? '' : `${rows.length < total ? `${rows.length} of ` : ''}${total} ${total === 1 ? 'post' : 'posts'}`}
         </p>

         <DetailDrawers kind="post" order={rows.map(({ slug }) => slug)} />
      </div>
   )
}
