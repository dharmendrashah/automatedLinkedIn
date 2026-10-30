import { Picture } from '@/components/details/detail-parts'
import { cdnUrlOf } from '@/lib/cdn'
import { useMediaSource } from '@/lib/use-media-source'
import { MessageSquare, Repeat2, ThumbsUp } from 'lucide-react'
import { useState } from 'react'

// A post as it reads on LinkedIn, shared by the post drawer and the post a person engaged with.

type Media = { url: string; type: string | null } | null

type Post = {
   text: string | null
   author: { name: string | null; avatar: string | null; headline: string | null; isCompany: boolean }
   reactions: number | null
   comments: number | null
   shares: number | null
   postedAt: string | null
   media: Media
   articleUrl: string | null
   repostNote: string | null
}

const TEXT_SHORT = 400

export const PostText = ({ text }: { text: string }) => {
   const [open, setOpen] = useState(false)
   const long = text.length > TEXT_SHORT

   return (
      <p className="text-sm whitespace-pre-line">
         {open || !long ? text : `${text.slice(0, TEXT_SHORT)}…`}
         {long ? (
            <button
               type="button"
               className="text-muted-foreground ml-1 text-xs font-medium hover:underline"
               onClick={() => setOpen(!open)}
            >
               {open ? 'show less' : 'see more'}
            </button>
         ) : null}
      </p>
   )
}

const PostImage = ({ url }: { url: string }) => {
   const { src, onError } = useMediaSource(url)

   return src ? (
      <img
         src={src}
         alt=""
         referrerPolicy="no-referrer"
         onError={onError}
         className="max-h-80 rounded-lg border object-cover"
      />
   ) : null
}

// Files open through the file cache; any other kind (a page, a playlist) opens where it is.
const FILE_MEDIA = /video|audio|document|pdf/

export const PostMedia = ({ media, articleUrl }: { media: Media; articleUrl: string | null }) => (
   <>
      {media?.type?.toLowerCase().includes('image') ? (
         <PostImage url={media.url} />
      ) : media ? (
         <a
            className="text-sm underline"
            href={FILE_MEDIA.test(media.type?.toLowerCase() ?? '') ? cdnUrlOf(media.url) : media.url}
            target="_blank"
            rel="noreferrer noopener"
         >
            Open the {media.type ?? 'media'}
         </a>
      ) : null}
      {articleUrl ? (
         <a className="text-sm underline" href={articleUrl} target="_blank" rel="noreferrer noopener">
            Open the linked article
         </a>
      ) : null}
   </>
)

export const PostNumbers = ({ post }: { post: Pick<Post, 'reactions' | 'comments' | 'shares'> }) => {
   const numbers = [
      {
         Icon: ThumbsUp,
         value: post.reactions,
         label: 'reactions',
      },
      {
         Icon: MessageSquare,
         value: post.comments,
         label: 'comments',
      },
      {
         Icon: Repeat2,
         value: post.shares,
         label: 'reposts',
      },
   ]

   return (
      <div className="text-muted-foreground flex flex-wrap gap-4 text-xs">
         {numbers.map(({ Icon, value, label }) =>
            value === null ? null : (
               <span key={label} className="flex items-center gap-1">
                  <Icon className="size-3.5" aria-hidden />
                  {value.toLocaleString()} {label}
               </span>
            )
         )}
      </div>
   )
}

// The post a person commented on or reacted to, in a small LinkedIn-like card.
export const PostCard = ({ post }: { post: Post }) => {
   const name = post.author.name ?? 'LinkedIn member'

   return (
      <div className="bg-background grid gap-2 rounded-lg border p-3">
         {post.repostNote ? <p className="text-muted-foreground text-xs">{post.repostNote}</p> : null}
         <div className="grid grid-cols-[auto_1fr] items-center gap-2">
            <Picture
               name={name}
               image={post.author.avatar}
               square={post.author.isCompany}
               className="size-10 border-0 text-sm"
            />
            <div className="grid min-w-0">
               <span className="truncate text-sm font-medium">{name}</span>
               {post.author.headline ? (
                  <span className="text-muted-foreground truncate text-xs">{post.author.headline}</span>
               ) : null}
               {post.postedAt ? <span className="text-muted-foreground text-xs">{post.postedAt}</span> : null}
            </div>
         </div>
         {post.text ? <PostText text={post.text} /> : null}
         <PostMedia media={post.media} articleUrl={post.articleUrl} />
         <PostNumbers post={post} />
      </div>
   )
}
