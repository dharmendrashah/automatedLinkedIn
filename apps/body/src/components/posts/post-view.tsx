import { DetailLoading, DetailMissing, PersonRow, Picture, ReadButton } from '@/components/details/detail-parts'
import { pollWhile } from '@/components/details/read-status'
import { useDetailStack } from '@/components/details/use-detail-stack'
import { Section } from '@/components/people/person-sections'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { timeAgo } from '@/lib/time-ago'
import { readableError } from '@/lib/trpc-error'
import { ExternalLink, MessageSquare, ThumbsUp, UserRound } from 'lucide-react'
import { type ReactNode, useRef, useState } from 'react'

import { formatUsd } from '../workflows/types'

import { type RouterOutputs, trpc } from '../../trpc'
import { POST_READ } from '../links/read-cost'
import { PostAuthor, PostCounts, PostMedia, PostText } from './post-body'
import { type EngagementKind, PostEngagement } from './post-engagement'

type PostDetail = RouterOutputs['postPage']['detail']
type Gist = NonNullable<PostDetail['author']>

const ACTION_CLASS = 'text-muted-foreground flex-1 font-semibold'

// The post as it reads on LinkedIn: the author, the text, its media, the counts and an action bar.
const ThePost = ({ detail, onEngagement }: { detail: PostDetail; onEngagement: (kind: EngagementKind) => void }) => {
   const utils = trpc.useUtils()
   const read = trpc.postPage.readFull.useMutation({
      onSuccess: data => utils.postPage.detail.setData({ slug: detail.slug }, data),
   })
   const { snapshot, post, author } = detail
   const link = post.expandedUrl ?? post.url
   const openLink: ReactNode = (
      <Button asChild variant="ghost" size="icon" className="shrink-0">
         <a
            href={link}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Open on LinkedIn"
            title="Open on LinkedIn"
         >
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
            {!author && snapshot?.author.url ? (
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

const AUTHOR_WHERE = {
   person: 'On My network',
   company: 'On /companies',
} as const

// The author as the owner has them, with the state of their read. A click opens their drawer on top of this one, or the
// page's drawer when there is no stack.
const AuthorGist = ({
   author,
   onPerson,
   onCompany,
}: {
   author: Gist
   onPerson: (slug: string) => void
   onCompany: (slug: string) => void
}) => {
   const stack = useDetailStack()
   const isCompany = author.kind === 'company'
   const name = author.name ?? author.slug
   const state = author.readAt ? `Read ${timeAgo(author.readAt)}` : author.reading ? 'Reading…' : 'Not read yet'
   const open = () => {
      if (stack) {
         stack(
            isCompany
               ? {
                    kind: 'company',
                    slug: author.slug,
                    ...(author.name && { name: author.name }),
                 }
               : {
                    kind: 'person',
                    slug: author.slug,
                 }
         )
      } else if (isCompany) {
         onCompany(author.slug)
      } else {
         onPerson(author.slug)
      }
   }

   return (
      <button
         type="button"
         onClick={open}
         className="hover:bg-muted flex w-full items-center gap-3 rounded-lg p-2 text-left"
      >
         <Picture name={name} image={author.photo} square={isCompany} className="size-12 shrink-0 border-0 text-sm" />
         <span className="grid min-w-0 flex-1 gap-0.5">
            <span className="truncate text-sm font-semibold">{name}</span>
            {author.headline ? (
               <span className="text-muted-foreground line-clamp-1 text-xs">{author.headline}</span>
            ) : null}
            {author.company ? (
               <span className="text-muted-foreground line-clamp-1 text-xs">{author.company}</span>
            ) : null}
            <span className="text-muted-foreground text-xs">{[AUTHOR_WHERE[author.kind], state].join(' · ')}</span>
            {author.read?.status === 'FAILED' && author.read.message ? (
               <span className="text-destructive text-xs">{author.read.message}</span>
            ) : null}
         </span>
      </button>
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
export const PostView = ({
   slug,
   onPerson,
   onCompany,
}: {
   slug: string
   onPerson: (slug: string) => void
   onCompany: (slug: string) => void
}) => {
   const detail = trpc.postPage.detail.useQuery(
      { slug },
      {
         retry: false,
         refetchInterval: query => pollWhile(query.state.data?.read, query.state.data?.author?.read),
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
         <ThePost detail={data} onEngagement={openEngagement} />
         {data.author ? (
            <Section title="Author">
               <AuthorGist author={data.author} onPerson={onPerson} onCompany={onCompany} />
            </Section>
         ) : null}
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
                        photo={person.photo}
                        badges={
                           <>
                              <Badge variant="outline">{STATES[person.state]}</Badge>
                              <Badge variant="secondary">In {person.list.name}</Badge>
                           </>
                        }
                        lines={[person.headline, person.score !== null ? `score ${person.score}` : null]}
                        onOpen={() => onPerson(person.slug)}
                     >
                        {person.comment ? <span className="text-sm whitespace-pre-line">{person.comment}</span> : null}
                     </PersonRow>
                  ))}
               </ul>
            )}
         </Section>
         <Workspace detail={data} />
      </div>
   )
}
