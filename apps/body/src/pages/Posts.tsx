import { DetailDrawers } from '@/components/details/detail-drawers'
import { useDetailDrawer } from '@/components/details/use-detail-drawer'
import { ListToolbar } from '@/components/links/list-toolbar'
import { LinkBulkBar } from '@/components/links/bulk-bar'
import { Pager } from '@/components/links/pager'
import { useSelection } from '@/components/links/use-selection'
import { useListState } from '@/components/links/use-list-state'
import { AddPostsDialog } from '@/components/posts/add-posts-dialog'
import { postStatuses } from '@/components/posts/post-statuses'
import { PostsTable } from '@/components/posts/posts-table'

import { type Post, type PostStatus } from '@/components/posts/types'

import { trpc } from '../trpc'

export const Posts = () => {
   const utils = trpc.useUtils()
   const state = useListState<PostStatus>()
   const selection = useSelection()
   const drawer = useDetailDrawer()

   const list = trpc.linkedInPost.list.useQuery(state.query, {
      retry: false,
      placeholderData: previous => previous,
   })

   const refresh = () => {
      void utils.linkedInPost.list.invalidate()
      void utils.label.list.invalidate()
   }
   const update = trpc.linkedInPost.update.useMutation({ onSuccess: refresh })
   const archive = trpc.linkedInPost.archive.useMutation({ onSuccess: refresh })
   const restore = trpc.linkedInPost.restore.useMutation({ onSuccess: refresh })
   const labelMany = trpc.linkedInPost.labelMany.useMutation({ onSuccess: refresh })
   const archiveMany = trpc.linkedInPost.archiveMany.useMutation({ onSuccess: refresh })

   const busyId = [update, archive, restore].find(mutation => mutation.isPending)?.variables?.id
   const actionError = [update, archive, restore, labelMany, archiveMany].find(action => action.error)?.error?.message

   const toggle = ({ id, status }: Post) =>
      update.mutate({
         id,
         status: status === 'PROCESSED' ? 'UNPROCESSED' : 'PROCESSED',
      })

   return (
      <div className="grid w-full gap-4 px-4 lg:px-6">
         <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
               <h2 className="text-lg font-semibold">LinkedIn posts</h2>
               <p className="text-muted-foreground text-sm">
                  The posts you want to work through. Paste their links to add them.
               </p>
            </div>
            <AddPostsDialog />
         </div>

         <ListToolbar
            state={state}
            statuses={postStatuses}
            kind="posts"
            searchLabel="Search posts"
            searchPlaceholder="Search by post link"
         />

         {actionError ? <p className="text-destructive text-sm">{actionError}</p> : null}

         <LinkBulkBar kind="posts" selection={selection} labelMany={labelMany} archiveMany={archiveMany} />

         <PostsTable
            posts={list.data?.items}
            loading={list.isPending}
            error={list.error?.message}
            busyId={busyId}
            onToggle={toggle}
            onArchive={post => archive.mutate({ id: post.id })}
            onRestore={post => restore.mutate({ id: post.id })}
            onOpen={post => drawer.show('post', post.slug)}
            onTag={state.addTag}
            selection={selection}
         />

         <Pager total={list.data?.total ?? 0} page={state.page} onPage={state.setPage} noun={['post', 'posts']} />
         <DetailDrawers kind="post" order={list.data?.items.map(({ slug }) => slug) ?? []} />
      </div>
   )
}
