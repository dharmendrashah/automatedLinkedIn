import { Mark } from '@/components/account-profile/mark'
import { FileText, Globe, MessageSquare, Repeat2, Send, ThumbsUp, Users } from 'lucide-react'
import { useState } from 'react'

import type { PostBlock, PostVisibility } from '@automatedLinkedIn/contracts'

import { cn } from '@/lib/utils'

import type { Identity } from './accounts'
import { formatBytes } from './files'
import { seeMore, splitText } from './preview-text'
import { joinedText, mediaBlock } from './rules'
import type { Attachment } from './rules'

export type PreviewWidth = 'desktop' | 'mobile'

type Props = {
   identity: Identity
   blocks: PostBlock[]
   urls: ReadonlyMap<string, string>
   width: PreviewWidth
   audience?: PostVisibility
}

const BLUE = 'text-[#0a66c2]'

const Words = ({ text }: { text: string }) => (
   <>
      {splitText(text).map((part, index) => (
         <span key={`${index}-${part.kind}`} className={part.kind === 'text' ? undefined : BLUE}>
            {part.value}
         </span>
      ))}
   </>
)

const Missing = ({ name }: { name: string }) => (
   <div className="grid size-full place-items-center bg-neutral-100 p-3 text-center text-xs text-neutral-500">
      {name} is not available yet.
   </div>
)

const PhotoGrid = ({ block, urls }: { block: Extract<Attachment, { type: 'PHOTOS' }>; urls: Props['urls'] }) => {
   const shown = block.items.slice(0, 4)
   const more = block.items.length - shown.length

   if (shown.length === 0) {
      return null
   }

   const layout =
      shown.length === 1
         ? 'grid-cols-1'
         : shown.length === 2
           ? 'grid-cols-2 aspect-[2/1]'
           : 'grid-cols-2 grid-rows-2 aspect-square'

   return (
      <div className={cn('grid gap-0.5', layout)}>
         {shown.map((item, index) => {
            const url = urls.get(item.id)

            return (
               <div
                  key={item.id}
                  className={cn(
                     'relative overflow-hidden bg-neutral-100',
                     shown.length === 3 && index === 0 && 'row-span-2',
                     shown.length === 1 && 'max-h-[28rem]'
                  )}
               >
                  {url ? (
                     <img
                        src={url}
                        alt={item.alt ?? ''}
                        className={cn('size-full object-cover', shown.length === 1 && 'max-h-[28rem] object-contain')}
                     />
                  ) : (
                     <Missing name={item.name} />
                  )}
                  {more > 0 && index === 3 ? (
                     <span className="absolute inset-0 grid place-items-center bg-black/50 text-2xl font-semibold text-white">
                        +{more}
                     </span>
                  ) : null}
               </div>
            )
         })}
      </div>
   )
}

const Action = ({ icon: Icon, label }: { icon: typeof ThumbsUp; label: string }) => (
   <span className="flex items-center justify-center gap-1.5 rounded-md px-2 py-3 text-sm font-semibold text-neutral-600">
      <Icon className="size-5" aria-hidden />
      {label}
   </span>
)

// The post as LinkedIn shows it in the feed: who it is from, the words, the attachment, and the buttons under it. It is always in
// LinkedIn's light look, because that is what readers see. The "see more" cut is an estimate. There are no counts: nothing has been
// posted, so there is nothing to count.
export const PostPreview = ({ identity, blocks, urls, width, audience = 'ANYONE' }: Props) => {
   const [expanded, setExpanded] = useState(false)
   const text = joinedText(blocks)
   const media = mediaBlock(blocks)
   const { shown, cut } = seeMore(text)
   const showCut = cut && !expanded

   return (
      <section
         aria-label="Post preview"
         className={cn(
            'mx-auto w-full overflow-hidden rounded-lg border border-neutral-200 bg-white text-neutral-900 shadow-sm',
            width === 'mobile' ? 'max-w-[22.5rem]' : 'max-w-[34rem]'
         )}
      >
         <div className="flex items-start gap-3 px-4 pt-3">
            <Mark
               name={identity.name}
               imageUrl={identity.imageUrl}
               className="size-12 bg-neutral-200 text-base text-neutral-600"
            />
            <div className="min-w-0 leading-tight">
               <p className="truncate text-sm font-semibold" dir="auto">
                  {identity.name}
               </p>
               {identity.headline ? (
                  <p className="line-clamp-2 text-xs text-neutral-500" dir="auto">
                     {identity.headline}
                  </p>
               ) : null}
               <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
                  Now ·{' '}
                  {audience === 'CONNECTIONS' ? (
                     <Users className="size-3" aria-label="Visible to connections only" role="img" />
                  ) : (
                     <Globe className="size-3" aria-label="Visible to anyone" role="img" />
                  )}
               </p>
            </div>
         </div>

         <div className="px-4 py-3 text-sm leading-snug break-words whitespace-pre-wrap" dir="auto">
            {text === '' ? (
               <span className="text-neutral-400">Your post will appear here as you write it.</span>
            ) : (
               <>
                  <Words text={showCut ? shown : text} />
                  {showCut ? (
                     <>
                        {'… '}
                        <button
                           type="button"
                           className="font-semibold text-neutral-500 hover:text-[#0a66c2] hover:underline"
                           onClick={() => setExpanded(true)}
                        >
                           see more
                        </button>
                     </>
                  ) : null}
               </>
            )}
         </div>

         {media?.type === 'PHOTOS' ? <PhotoGrid block={media} urls={urls} /> : null}

         {media?.type === 'VIDEO' && media.file ? (
            <div className="aspect-video max-h-[28rem] bg-black">
               {urls.get(media.file.id) ? (
                  <video
                     src={urls.get(media.file.id)}
                     controls
                     preload="metadata"
                     className="size-full object-contain"
                  />
               ) : (
                  <Missing name={media.file.name} />
               )}
            </div>
         ) : null}

         {media?.type === 'DOCUMENT' ? (
            <div className="mx-4 mb-3 flex items-center gap-3 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-3">
               <FileText className="size-8 shrink-0 text-[#0a66c2]" aria-hidden />
               <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{media.file.name}</p>
                  <p className="text-xs text-neutral-500">Document · {formatBytes(media.file.bytes)}</p>
               </div>
            </div>
         ) : null}

         {media?.type === 'LINK' && URL.canParse(media.url) ? (
            <div className="mx-4 mb-3 grid gap-0.5 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2">
               <p className="truncate text-sm font-semibold">{new URL(media.url).hostname}</p>
               <p className="truncate text-xs text-neutral-500">{media.url}</p>
            </div>
         ) : null}

         <div aria-hidden className="mx-4 grid grid-cols-4 border-t border-neutral-200">
            <Action icon={ThumbsUp} label="Like" />
            <Action icon={MessageSquare} label="Comment" />
            <Action icon={Repeat2} label="Repost" />
            <Action icon={Send} label="Send" />
         </div>
      </section>
   )
}
