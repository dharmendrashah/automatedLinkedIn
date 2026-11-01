import { DetailLoading, DetailMissing, PersonRow, ReadButton } from '@/components/details/detail-parts'
import { pollWhile } from '@/components/details/read-status'
import { Section } from '@/components/people/person-sections'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { readableError } from '@/lib/trpc-error'
import { ExternalLink, MessageSquare, ThumbsUp, UserRound } from 'lucide-react'
import { type ReactNode, useRef, useState } from 'react'

import { type RouterOutputs, trpc } from '../../trpc'
import { POST_READ } from '../links/read-cost'
import { formatUsd } from '../workflows/types'
import { PostAuthor, PostCounts, PostMedia, PostText } from './post-body'
import { type EngagementKind, PostEngagement } from './post-engagement'

type PostDetail = RouterOutputs['postPage']['detail']

const ACTION_CLASS = 'text-muted-foreground flex-1 font-semibold'

// The post as it reads on LinkedIn: the author, the text, its media, the counts and an action bar.
const ThePost = ({
   detail,
   onPerson,
   onEngagement,
}: {
   detail: PostDetail
   onPerson: (slug: string) => void
   onEngagement: (kind: EngagementKind) => void
}) => {
   const utils = trpc.useUtils()
   const read = trpc.postPage.readFull.useMutation({
      onSuccess: data => utils.postPage.detail.setData({ slug: detail.slug }, data),
   })
   const { snapshot, post, authorSlug } = detail
   const link = post.expandedUrl ?? post.url
   const openLink: ReactNode = (
      <Button asChild variant="ghost" size="icon" className="shrink-0">
         <a href={link} target="_blank" rel="noreferrer noopener" aria-label="Open on LinkedIn" title="Open on LinkedIn">
            <ExternalLink />
         </a>
      </Button>
   )

   return (
      <article className="bg-card overflow-hidden rounded-xl border">
         {snapshot?.repostNote ? (
            <p className="text-muted-foreground border-b px-4 py-2 text-xs">{snapshot.repostNote}</p>
         ) : null}
         <div className="grid gap-3 px-4 pt-4 pb-3">
            {snapshot ? (
               <PostAuthor
                  author={snapshot.author}
                  postedAt={snapshot.postedAt}
                  name={
                     <DrawerTitle className="truncate text-sm font-semibold">
                        {snapshot.author.name ?? 'LinkedIn member'}
                     </DrawerTitle>
                  }
                  actions={openLink}
               />
            ) : (
               <div className="flex items-start gap-3">
                  <div className="grid min-w-0 flex-1 gap-1">
                     <DrawerTitle className="text-sm font-semibold">A LinkedIn post</DrawerTitle>
                     <p className="text-muted-foreground text-xs break-all">{link}</p>
                  </div>
                  {openLink}
               </div>
            )}
            <DrawerDescription className="sr-only">{link}</DrawerDescription>
            {snapshot?.text ? <PostText text={snapshot.text} /> : null}
            {snapshot ? null : (
               <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-sm">
                  Not read yet. Read the post to see the author, the text, the media and the counts (about{' '}
                  {formatUsd(POST_READ.micros)}).
               </p>
            )}
         </div>
         {snapshot ? <PostMedia media={snapshot.media} articleUrl={snapshot.articleUrl} /> : null}
         {snapshot ? (
            <div className="px-4 py-2">
               <PostCounts
                  post={snapshot}
                  onReactions={() => onEngagement('reactions')}
                  onComments={() => onEngagement('comments')}
               />
            </div>
         ) : null}
         <div className="flex items-center gap-1 border-t px-2 py-1">
            <Button variant="ghost" size="sm" className={ACTION_CLASS} onClick={() => onEngagement('reactions')}>
               <ThumbsUp />
               Reactions
            </Button>
            <Button variant="ghost" size="sm" className={ACTION_CLASS} onClick={() => onEngagement('comments')}>
               <MessageSquare />
               Comments
            </Button>
            {authorSlug ? (
               <Button variant="ghost" size="sm" className={ACTION_CLASS} onClick={() => onPerson(authorSlug)}>
                  <UserRound />
                  Author
               </Button>
            ) : snapshot?.author.url ? (
               <Button asChild variant="ghost" size="sm" className={ACTION_CLASS}>
                  <a href={snapshot.author.url} target="_blank" rel="noreferrer noopener">
                     <UserRound />
                     Author
                  </a>
               </Button>
            ) : null}
         </div>
         <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
            <ReadButton
               what="post"
               readAt={snapshot?.fetchedAt ?? null}
               read={detail.read}
               pending={read.isPending}
               error={read.error}
               onRead={() => read.mutate({ slug: detail.slug })}
            />
         </div>
      </article>
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
      void utils.linkedInPost.counts.invalidate()
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
   const [tab, setTab] = useState<EngagementKind>('comments')
   const engagement = useRef<HTMLDivElement>(null)

   if (!data) {
      return detail.error ? <DetailMissing error={detail.error} /> : <DetailLoading what="post" />
   }

   const openEngagement = (kind: EngagementKind) => {
      setTab(kind)
      engagement.current?.scrollIntoView({
         behavior: 'smooth',
         block: 'start',
      })
   }

   return (
      <div className="grid gap-3">
         <ThePost detail={data} onPerson={onPerson} onEngagement={openEngagement} />
         <div ref={engagement} className="scroll-mt-4">
            <PostEngagement
               slug={data.slug}
               tab={tab}
               onTab={setTab}
               counts={{
                  comments: data.snapshot?.comments ?? null,
                  reactions: data.snapshot?.reactions ?? null,
               }}
               onPerson={onPerson}
            />
         </div>
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
         <Workspace detail={data} />
      </div>
   )
}
