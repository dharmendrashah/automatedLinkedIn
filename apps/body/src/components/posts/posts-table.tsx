import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CircleCheck, FileText, Loader2, Undo2 } from 'lucide-react'

import { cn } from '@/lib/utils'

import { postStatuses } from './post-statuses'
import { type Post } from './types'

import { StatusBadge } from '../links/link-status-badge'
import { RowActions } from '../links/row-actions'
import { StateRows } from '../links/state-rows'

const COLUMNS = 4

const formatDate = (value: string) => new Date(value).toLocaleDateString()

// The link without its scheme, so a row shows what identifies the post.
const label = ({ url }: Post) => url.replace(/^https:\/\/(www\.)?/, '')

type Props = {
   posts: Post[] | undefined
   loading: boolean
   error: string | undefined
   busyId: string | undefined
   onToggle: (post: Post) => void
   onArchive: (post: Post) => void
   onRestore: (post: Post) => void
   onOpen: (post: Post) => void
}

export const PostsTable = ({ posts, loading, error, busyId, onToggle, onArchive, onRestore, onOpen }: Props) => (
   <div className="overflow-hidden rounded-lg border">
      <Table>
         <TableHeader className="bg-muted/50">
            <TableRow>
               <TableHead>Post</TableHead>
               <TableHead>Status</TableHead>
               <TableHead>Added</TableHead>
               <TableHead className="w-28" />
            </TableRow>
         </TableHeader>
         <TableBody>
            <StateRows
               loading={loading}
               error={error}
               empty={posts?.length === 0}
               columns={COLUMNS}
               emptyIcon={FileText}
               emptyText="No posts found. Use Add posts to paste some LinkedIn links."
            />
            {posts?.map(post => {
               const processed = post.status === 'PROCESSED'
               const busy = busyId === post.id

               return (
                  <TableRow key={post.id} className={cn(post.archivedAt && 'opacity-60')}>
                     <TableCell>
                        <button
                           type="button"
                           className="text-left font-medium break-all underline-offset-4 hover:underline"
                           onClick={() => onOpen(post)}
                        >
                           {label(post)}
                        </button>
                     </TableCell>
                     <TableCell>
                        <span className="flex flex-wrap items-center gap-1">
                           <StatusBadge {...postStatuses[post.status]} />
                           {post.archivedAt ? <Badge variant="secondary">Archived</Badge> : null}
                        </span>
                     </TableCell>
                     <TableCell className="text-muted-foreground">{formatDate(post.createdAt)}</TableCell>
                     <TableCell>
                        <div className="flex items-center justify-end gap-1">
                           <Button
                              variant="ghost"
                              size="icon"
                              disabled={busy}
                              aria-label={`Mark ${label(post)} as ${processed ? 'unprocessed' : 'processed'}`}
                              onClick={() => onToggle(post)}
                           >
                              {busy ? <Loader2 className="animate-spin" /> : processed ? <Undo2 /> : <CircleCheck />}
                           </Button>
                           <RowActions
                              name={label(post)}
                              archived={Boolean(post.archivedAt)}
                              busy={busy}
                              onArchive={() => onArchive(post)}
                              onRestore={() => onRestore(post)}
                           />
                        </div>
                     </TableCell>
                  </TableRow>
               )
            })}
         </TableBody>
      </Table>
   </div>
)
