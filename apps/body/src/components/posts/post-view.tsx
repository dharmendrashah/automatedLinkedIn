import { Cover, DetailLoading, DetailMissing, PersonRow, Picture, ReadButton } from '@/components/details/detail-parts'
import { pollWhile } from '@/components/details/read-status'
import { Section } from '@/components/people/person-sections'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { readableError } from '@/lib/trpc-error'
import { ExternalLink, UserRound } from 'lucide-react'

import { type RouterOutputs, trpc } from '../../trpc'
import { PostMedia, PostNumbers, PostText } from './post-body'
import { PostEngagement } from './post-engagement'

type PostDetail = RouterOutputs['postPage']['detail']

// The post as it reads on LinkedIn: the author, the text, its media and how people reacted.
const ThePost = ({ detail, onPerson }: { detail: PostDetail; onPerson: (slug: string) => void }) => {
   const utils = trpc.useUtils()
   const read = trpc.postPage.readFull.useMutation({
      onSuccess: data => utils.postPage.detail.setData({ slug: detail.slug }, data),
   })
   const { snapshot, post, authorSlug } = detail
   const author = snapshot?.author
   const name = author?.name ?? 'Post'

   return (
      <Cover>
         <Picture name={name} image={author?.avatar ?? null} square={author?.isCompany === true} />
         <div className="grid gap-1">
            <DrawerTitle className="text-xl">{author?.name ?? 'A LinkedIn post'}</DrawerTitle>
            {author?.headline ? (
               <DrawerDescription className="text-foreground text-sm">{author.headline}</DrawerDescription>
            ) : (
               <DrawerDescription className="text-xs break-all">{post.expandedUrl ?? post.url}</DrawerDescription>
            )}
            {author?.followers || snapshot?.postedAt ? (
               <p className="text-muted-foreground text-xs">
                  {[
                     author?.followers ? `${author.followers.toLocaleString()} followers` : null,
                     snapshot?.postedAt ? `Posted ${snapshot.postedAt}` : null,
                  ]
                     .filter(Boolean)
                     .join(' · ')}
               </p>
            ) : null}
         </div>
         {snapshot?.repostNote ? <p className="text-muted-foreground text-xs">{snapshot.repostNote}</p> : null}
         {snapshot?.text ? <PostText text={snapshot.text} /> : null}
         {snapshot ? <PostMedia media={snapshot.media} articleUrl={snapshot.articleUrl} /> : null}
         {snapshot ? <PostNumbers post={snapshot} /> : null}
         <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm">
               <a href={post.expandedUrl ?? post.url} target="_blank" rel="noreferrer noopener">
                  <ExternalLink />
                  Open on LinkedIn
               </a>
            </Button>
            {authorSlug ? (
               <Button size="sm" variant="outline" onClick={() => onPerson(authorSlug)}>
                  <UserRound />
                  The author
               </Button>
            ) : author?.url ? (
               <Button asChild size="sm" variant="outline">
                  <a href={author.url} target="_blank" rel="noreferrer noopener">
                     <UserRound />
                     The author on LinkedIn
                  </a>
               </Button>
            ) : null}
            <ReadButton
               what="post"
               readAt={snapshot?.fetchedAt ?? null}
               read={detail.read}
               pending={read.isPending}
               error={read.error}
               onRead={() => read.mutate({ slug: detail.slug })}
            />
         </div>
      </Cover>
   )
}

const STATES = {
   QUALIFIED: 'Qualified',
   MAYBE: 'Maybe',
   UNSCORED: 'Not scored',
} as const

const Workspace = ({ detail }: { detail: PostDetail }) => {
   const utils = trpc.useUtils()
   const refresh = () => {
      void utils.postPage.detail.invalidate({ slug: detail.slug })
      void utils.linkedInPost.list.invalidate()
      void utils.linkedInPost.summary.invalidate()
   }
   const update = trpc.linkedInPost.update.useMutation({ onSuccess: refresh })
   const { post } = detail
   const done = post.status === 'PROCESSED'

   return (
      <Section title="In your workspace">
         <div className="flex flex-wrap items-center gap-2">
            <Badge variant={done ? 'secondary' : 'outline'}>{done ? 'Done' : 'To work'}</Badge>
            <Button
               variant="outline"
               size="sm"
               onClick={() => update.mutate({ id: post.id, status: done ? 'UNPROCESSED' : 'PROCESSED' })}
            >
               {done ? 'Back to work' : 'Mark done'}
            </Button>
         </div>
         {update.error ? <p className="text-destructive text-sm">{readableError(update.error)}</p> : null}
      </Section>
   )
}

// One post, like on LinkedIn, with the people a workflow found from it.
export const PostView = ({ slug, onPerson }: { slug: string; onPerson: (slug: string) => void }) => {
   const detail = trpc.postPage.detail.useQuery(
      { slug },
      {
         retry: false,
         refetchInterval: query => pollWhile(query.state.data?.read),
      }
   )
   const data = detail.data

   if (!data) {
      return detail.error ? <DetailMissing error={detail.error} /> : <DetailLoading what="post" />
   }

   return (
      <div className="grid gap-3">
         <ThePost detail={data} onPerson={onPerson} />
         {data.snapshot ? null : (
            <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
               The text, author and reactions show after Read post.
            </p>
         )}
         <Section title={`People found from this post (${data.people.length})`}>
            {data.people.length === 0 ? (
               <p className="text-muted-foreground text-sm">No workflow has found anyone from this post yet.</p>
            ) : (
               <ul className="grid gap-1">
                  {data.people.map(person => (
                     <PersonRow
                        key={person.slug}
                        name={person.name ?? person.slug}
                        lines={[
                           person.headline,
                           [
                              STATES[person.state],
                              person.score !== null ? `score ${person.score}` : null,
                              person.list.name,
                           ]
                              .filter(Boolean)
                              .join(' · '),
                           person.comment ? `"${person.comment}"` : null,
                        ]}
                        onOpen={() => onPerson(person.slug)}
                     />
                  ))}
               </ul>
            )}
         </Section>
         <PostEngagement
            slug={data.slug}
            counts={{
               comments: data.snapshot?.comments ?? null,
               reactions: data.snapshot?.reactions ?? null,
            }}
            onPerson={onPerson}
         />
         <Workspace detail={data} />
      </div>
   )
}
