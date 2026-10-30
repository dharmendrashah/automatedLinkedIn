import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { FileText, Link2, Loader2, Plus, RotateCw, Upload, X } from 'lucide-react'

import { cn } from '@/lib/utils'

import { formatBytes } from './files'
import { type Attachment, LIMITS } from './rules'
import type { UploadState } from './use-uploads'

type Props = {
   attachment: Attachment
   // Where each file can be shown from: the copy on this device, or a signed link to the bucket.
   urls: ReadonlyMap<string, string>
   uploads: Record<string, UploadState>
   onRetry: (id: string) => void
   onAddPhotos: () => void
   onAttachAgain: (id: string, kind: 'PHOTOS' | 'VIDEO') => void
   onAlt: (photoId: string, alt: string) => void
   onRemovePhoto: (photoId: string) => void
   onRemove: () => void
}

const Remove = ({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) => (
   <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
         'focus-visible:ring-ring absolute top-1.5 right-1.5 z-10 grid size-7 place-items-center rounded-full bg-black/65 text-white hover:bg-black/80 focus-visible:ring-2 focus-visible:outline-none',
         className
      )}
   >
      <X className="size-4" aria-hidden />
   </button>
)

// Where the upload of a file is, written over it: a bar while it goes, the sentence and a retry when it failed.
const UploadStatus = ({ state, onRetry }: { state: UploadState | undefined; onRetry: () => void }) => {
   if (!state) {
      return null
   }

   if (state.status === 'uploading') {
      return (
         <div
            role="status"
            className="absolute inset-x-0 bottom-0 z-[5] bg-black/60 px-2 pt-1.5 pb-1 text-[11px] text-white"
         >
            <span className="flex items-center gap-1">
               <Loader2 className="size-3 animate-spin" aria-hidden />
               Uploading {state.percent}%
            </span>
            <span className="mt-1 block h-1 overflow-hidden rounded bg-white/30">
               <span className="bg-primary block h-full" style={{ width: `${state.percent}%` }} />
            </span>
         </div>
      )
   }

   return (
      <div
         role="alert"
         className="bg-destructive/90 absolute inset-x-0 bottom-0 z-[5] px-2 py-1.5 text-[11px] text-white"
      >
         <span className="block">{state.reason}</span>
         <button type="button" onClick={onRetry} className="mt-1 inline-flex items-center gap-1 font-medium underline">
            <RotateCw className="size-3" aria-hidden />
            Try again
         </button>
      </div>
   )
}

// What the photos and the video show over themselves; a document has no picture, so its state is a line under its card.
const DocumentNote = ({
   state,
   stored,
   onRetry,
}: {
   state: UploadState | undefined
   stored: boolean
   onRetry: () => void
}) => {
   if (state?.status === 'uploading') {
      return (
         <div role="status" className="grid gap-1 px-3 pb-3 text-xs">
            <span>Uploading {state.percent}%</span>
            <span className="bg-muted block h-1 overflow-hidden rounded">
               <span className="bg-primary block h-full" style={{ width: `${state.percent}%` }} />
            </span>
         </div>
      )
   }

   if (state?.status === 'failed') {
      return (
         <p role="alert" className="text-destructive px-3 pb-3 text-xs">
            {state.reason}{' '}
            <button type="button" onClick={onRetry} className="font-medium underline">
               Try again
            </button>
         </p>
      )
   }

   return stored ? null : (
      <p className="text-muted-foreground px-3 pb-3 text-xs">
         Not stored. Remove it and add it again to keep it with the draft.
      </p>
   )
}

// What the post carries, shown under its text the way the feed will show it. Photos get a thumbnail each with a button for the
// text that describes it; a video plays here; a document and a link are one card. A file shows from this device or from the bucket,
// and its upload is written over it.
export const AttachmentArea = ({
   attachment,
   urls,
   uploads,
   onRetry,
   onAddPhotos,
   onAttachAgain,
   onAlt,
   onRemovePhoto,
   onRemove,
}: Props) => {
   if (attachment.type === 'PHOTOS') {
      return (
         <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {attachment.items.map((item, index) => {
               const url = urls.get(item.id)

               return (
                  <li key={item.id} className="bg-muted relative aspect-square overflow-hidden rounded-lg">
                     {url ? (
                        <img src={url} alt={item.alt ?? ''} className="size-full object-cover" />
                     ) : item.key ? (
                        <div className="text-muted-foreground grid size-full animate-pulse place-items-center text-xs">
                           Loading…
                        </div>
                     ) : (
                        <button
                           type="button"
                           className="text-muted-foreground hover:bg-accent focus-visible:ring-ring grid size-full place-items-center gap-1 p-2 text-center text-xs focus-visible:ring-2 focus-visible:outline-none"
                           onClick={() => onAttachAgain(item.id, 'PHOTOS')}
                        >
                           <span className="grid justify-items-center gap-1">
                              <Upload className="size-4" aria-hidden />
                              Attach {item.name} again
                           </span>
                        </button>
                     )}
                     <Remove label={`Remove photo ${index + 1}`} onClick={() => onRemovePhoto(item.id)} />
                     <UploadStatus state={uploads[item.id]} onRetry={() => onRetry(item.id)} />
                     <Popover>
                        <PopoverTrigger asChild>
                           <Button
                              type="button"
                              size="xs"
                              variant="secondary"
                              className={cn('absolute left-1.5', uploads[item.id] ? 'bottom-12' : 'bottom-1.5')}
                              aria-label={`Description of photo ${index + 1}`}
                           >
                              {item.alt ? 'Alt ✓' : '+ Alt'}
                           </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-72">
                           <label htmlFor={`alt-${item.id}`} className="text-sm font-medium">
                              Describe this photo
                           </label>
                           <p className="text-muted-foreground mb-2 text-xs">For people who cannot see it.</p>
                           <Input
                              id={`alt-${item.id}`}
                              value={item.alt ?? ''}
                              maxLength={LIMITS.ALT}
                              onChange={event => onAlt(item.id, event.target.value)}
                           />
                        </PopoverContent>
                     </Popover>
                  </li>
               )
            })}
            {attachment.items.length < LIMITS.PHOTOS ? (
               <li>
                  <button
                     type="button"
                     onClick={onAddPhotos}
                     className="text-muted-foreground hover:bg-accent focus-visible:ring-ring grid aspect-square w-full place-items-center rounded-lg border border-dashed text-sm focus-visible:ring-2 focus-visible:outline-none"
                  >
                     <span className="grid justify-items-center gap-1">
                        <Plus className="size-5" aria-hidden />
                        Add more
                     </span>
                  </button>
               </li>
            ) : null}
         </ul>
      )
   }

   if (attachment.type === 'VIDEO') {
      const url = urls.get(attachment.file.id)

      return (
         <div className="relative overflow-hidden rounded-lg bg-black">
            {url ? (
               <video src={url} controls preload="metadata" className="max-h-80 w-full" />
            ) : attachment.file.key ? (
               <div className="grid h-40 w-full animate-pulse place-items-center text-sm text-white/70">Loading…</div>
            ) : (
               <button
                  type="button"
                  onClick={() => onAttachAgain(attachment.file.id, 'VIDEO')}
                  className="grid h-40 w-full place-items-center text-sm text-white/80 hover:text-white"
               >
                  <span className="grid justify-items-center gap-1">
                     <Upload className="size-5" aria-hidden />
                     Attach {attachment.file.name} again
                  </span>
               </button>
            )}
            <Remove label="Remove the video" onClick={onRemove} />
            <UploadStatus state={uploads[attachment.file.id]} onRetry={() => onRetry(attachment.file.id)} />
         </div>
      )
   }

   const Icon = attachment.type === 'DOCUMENT' ? FileText : Link2
   const [title, detail] =
      attachment.type === 'DOCUMENT'
         ? [attachment.file.name, `Document · ${formatBytes(attachment.file.bytes)}`]
         : [new URL(attachment.url).hostname, attachment.url]
   const state = attachment.type === 'DOCUMENT' ? uploads[attachment.file.id] : undefined

   return (
      <div className="bg-muted/40 relative overflow-hidden rounded-lg border">
         <div className="flex items-center gap-3 p-3 pr-12">
            <Icon className="text-primary size-8 shrink-0" aria-hidden />
            <div className="min-w-0">
               <p className="truncate text-sm font-medium">{title}</p>
               <p className="text-muted-foreground truncate text-xs">{detail}</p>
            </div>
         </div>
         <Remove
            label={attachment.type === 'DOCUMENT' ? 'Remove the document' : 'Remove the link'}
            onClick={onRemove}
            className="top-1/2 -translate-y-1/2 bg-black/50"
         />
         {attachment.type === 'DOCUMENT' ? (
            <DocumentNote
               state={state}
               stored={Boolean(attachment.file.key)}
               onRetry={() => onRetry(attachment.file.id)}
            />
         ) : null}
      </div>
   )
}
