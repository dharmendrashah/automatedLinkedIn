import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Eye, MessageSquare, Repeat2, ThumbsUp } from 'lucide-react'
import { type ReactNode } from 'react'

import type { AccountProfile } from '@automatedLinkedIn/contracts'

import { compactCount, fullCount } from './counts'
import { ExpandableText } from './expandable-text'
import { Mark } from './mark'
import { Section } from './section'

type Post = NonNullable<AccountProfile['activity']>['posts'][number]

const Stat = ({ icon, value, label }: { icon: ReactNode; value: number | undefined; label: string }) =>
   value === undefined ? null : (
      <span className="relative inline-flex items-center gap-1" title={`${fullCount(value)} ${label}`}>
         {icon}
         <span aria-hidden>{compactCount(value)}</span>
         <span className="sr-only">
            {fullCount(value)} {label}
         </span>
      </span>
   )

const PostCard = ({ post }: { post: Post }) => (
   <article className="grid w-72 shrink-0 snap-start content-start gap-2 rounded-lg border p-3">
      {post.kind === 'REPOST' ? <p className="text-muted-foreground text-xs">Reposted</p> : null}
      <header className="flex items-center gap-2">
         <Mark name={post.author} imageUrl={post.authorImageUrl} className="size-8 text-xs" />
         <div className="grid min-w-0">
            <p className="truncate text-sm font-medium">{post.author}</p>
            <p className="text-muted-foreground truncate text-xs">{post.when}</p>
         </div>
      </header>
      <ExpandableText text={post.text} lines={6} />
      <footer className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
         <Stat icon={<ThumbsUp className="size-3.5" aria-hidden />} value={post.reactions} label="reactions" />
         <Stat icon={<MessageSquare className="size-3.5" aria-hidden />} value={post.comments} label="comments" />
         <Stat icon={<Repeat2 className="size-3.5" aria-hidden />} value={post.reposts} label="reposts" />
         <Stat icon={<Eye className="size-3.5" aria-hidden />} value={post.impressions} label="impressions" />
      </footer>
   </article>
)

const Row = ({ posts, empty }: { posts: Post[]; empty: string }) =>
   posts.length === 0 ? (
      <p className="text-muted-foreground text-sm">{empty}</p>
   ) : (
      <ul className="flex snap-x gap-3 overflow-x-auto pb-2">
         {posts.map((post, index) => (
            <li key={index} className="flex">
               <PostCard post={post} />
            </li>
         ))}
      </ul>
   )

// The posts and comments of the account, newest first, as a row of cards to scroll.
export const ActivityCard = ({ activity }: Pick<AccountProfile, 'activity'>) => {
   if (!activity || (activity.posts.length === 0 && activity.comments.length === 0)) {
      return null
   }

   return (
      <Section
         title="Activity"
         action={
            activity.followers === undefined ? null : (
               <span className="text-primary text-sm font-medium">{fullCount(activity.followers)} followers</span>
            )
         }
      >
         <Tabs defaultValue={activity.posts.length > 0 ? 'posts' : 'comments'}>
            <TabsList>
               <TabsTrigger value="posts">Posts</TabsTrigger>
               <TabsTrigger value="comments">Comments</TabsTrigger>
            </TabsList>
            <TabsContent value="posts">
               <Row posts={activity.posts} empty="No posts yet." />
            </TabsContent>
            <TabsContent value="comments">
               <Row posts={activity.comments} empty="No comments yet." />
            </TabsContent>
         </Tabs>
      </Section>
   )
}
