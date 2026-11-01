import { Picture } from '@/components/details/detail-parts'
import { cdnUrlOf } from '@/lib/cdn'
import { useMediaSource } from '@/lib/use-media-source'
import { FileText, Link2, MessageSquare, Repeat2, ThumbsUp } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { cn } from '@/lib/utils'

import { mediaKind, postedText } from './post-row'

// A post as it reads on LinkedIn, shared by the post drawer and the post a person engaged with. Media load only through
// the CDN (`/cdn`).

type Media = { url: string; type: string | null } | null

type Author = { name: string | null; avatar: string | null; headline: string | null; isCompany: boolean }

type Post = {
   text: string | null
   author: Author
   reactions: number | null
   comments: number | null
   shares: number | null
   postedAt: string | null
   media: Media
   articleUrl: string | null
   repostNote: string | null
}

const TEXT_SHORT = 300

export const PostText = ({ text }: { text: string }) => {
   const [open, setOpen] = useState(false)
   const long = text.length > TEXT_SHORT

   return (
      <p className="text-sm leading-relaxed whitespace-pre-line">
         {open || !long ? text : `${text.slice(0, TEXT_SHORT).trimEnd()}…`}
         {long ? (
            <button
               type="button"
               className="text-muted-foreground ml-1 text-sm font-medium hover:underline"
               onClick={() => setOpen(!open)}
            >
               {open ? 'show less' : 'see more'}
            </button>
         ) : null}
      </p>
   )
}

// Who posted it, as LinkedIn's post header: photo, name, headline and when. `name` lets the drawer use its title.
export const PostAuthor = ({
   author,
   postedAt,
   name,
   actions,
   size = 'md',
}: {
   author: Author
   postedAt: string | null
   name?: ReactNode
   actions?: ReactNode
   size?: 'sm' | 'md'
}) => {
   const shown = author.name ?? 'LinkedIn member'
   const posted = postedText(postedAt)

   return (
      <div className="flex items-start gap-3">
         <Picture
            name={shown}
            image={author.avatar}
            square={author.isCompany}
            className={cn('shrink-0 border-0 text-sm', size === 'md' ? 'size-12' : 'size-10', author.isCompany && 'rounded-md')}
         />
         <div className="grid min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-semibold">{name ?? shown}</div>
            {author.headline ? (
               <span className="text-muted-foreground line-clamp-1 text-xs">{author.headline}</span>
            ) : null}
            {posted ? (
               <span className="text-muted-foreground text-xs" title={postedAt ?? undefined}>
                  {posted}
               </span>
            ) : null}
         </div>
         {actions}
      </div>
   )
}

const PostImage = ({ url }: { url: string }) => {
   const { src, onError } = useMediaSource(url)

   return src ? (
      <img src={src} alt="" referrerPolicy="no-referrer" onError={onError} className="max-h-[32rem] w-full object-contain" />
   ) : null
}

const Tile = ({ href, icon, title, hint }: { href: string; icon: ReactNode; title: string; hint: string }) => (
   <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="bg-muted/50 hover:bg-muted flex items-center gap-3 border-y px-4 py-3 text-sm"
   >
      <span className="text-muted-foreground">{icon}</span>
      <span className="grid min-w-0">
         <span className="truncate font-medium">{title}</span>
         <span className="text-muted-foreground truncate text-xs">{hint}</span>
      </span>
   </a>
)

const hostOf = (url: string) => (URL.canParse(url) ? new URL(url).hostname.replace(/^www\./, '') : url)

// The post's picture, video, file or linked article, full width as on LinkedIn.
export const PostMedia = ({ media, articleUrl }: { media: Media; articleUrl: string | null }) => {
   const kind = media ? mediaKind(media.type) : null

   return (
      <>
         {media && kind === 'image' ? <PostImage url={media.url} /> : null}
         {media && kind === 'video' ? (
            // oxlint-disable-next-line jsx-a11y/media-has-caption -- LinkedIn gives no captions for a post's video
            <video controls preload="metadata" src={cdnUrlOf(media.url)} className="max-h-[32rem] w-full bg-black" />
         ) : null}
         {media && kind === 'file' ? (
            <Tile
               href={cdnUrlOf(media.url)}
               icon={<FileText className="size-5" />}
               title={`Open the ${media.type?.toLowerCase() ?? 'file'}`}
               hint="Attached to the post"
            />
         ) : null}
         {articleUrl ? (
            <Tile href={articleUrl} icon={<Link2 className="size-5" />} title="Linked article" hint={hostOf(articleUrl)} />
         ) : null}
      </>
   )
}

const Count = ({ children, label, onClick }: { children: ReactNode; label: string; onClick?: () => void }) =>
   onClick ? (
      <button type="button" className="flex items-center gap-1 hover:text-primary hover:underline" aria-label={label} onClick={onClick}>
         {children}
      </button>
   ) : (
      <span className="flex items-center gap-1" aria-label={label}>
         {children}
      </span>
   )

// Reactions on the left, comments and reposts on the right, as under a LinkedIn post; a count opens its list when given.
export const PostCounts = ({
   post,
   onReactions,
   onComments,
}: {
   post: Pick<Post, 'reactions' | 'comments' | 'shares'>
   onReactions?: () => void
   onComments?: () => void
}) => (
   <div className="text-muted-foreground flex items-center justify-between gap-4 text-xs">
      {post.reactions === null ? (
         <span />
      ) : (
         <Count label={`${post.reactions} reactions`} onClick={onReactions}>
            <ThumbsUp className="size-3.5 text-primary" aria-hidden />
            {post.reactions.toLocaleString()}
         </Count>
      )}
      <span className="flex items-center gap-3">
         {post.comments === null ? null : (
            <Count label={`${post.comments} comments`} onClick={onComments}>
               <MessageSquare className="size-3.5" aria-hidden />
               {post.comments.toLocaleString()} {post.comments === 1 ? 'comment' : 'comments'}
            </Count>
         )}
         {post.shares === null ? null : (
            <span className="flex items-center gap-1">
               <Repeat2 className="size-3.5" aria-hidden />
               {post.shares.toLocaleString()} {post.shares === 1 ? 'repost' : 'reposts'}
            </span>
         )}
      </span>
   </div>
)

// The post a person commented on or reacted to, in a small LinkedIn-like card.
export const PostCard = ({ post }: { post: Post }) => (
   <div className="bg-background grid gap-2 overflow-hidden rounded-lg border py-3">
      {post.repostNote ? <p className="text-muted-foreground border-b px-3 pb-2 text-xs">{post.repostNote}</p> : null}
      <div className="px-3">
         <PostAuthor author={post.author} postedAt={post.postedAt} size="sm" />
      </div>
      {post.text ? (
         <div className="px-3">
            <PostText text={post.text} />
         </div>
      ) : null}
      <PostMedia media={post.media} articleUrl={post.articleUrl} />
      <div className="px-3">
         <PostCounts post={post} />
      </div>
   </div>
)
