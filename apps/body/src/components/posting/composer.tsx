import { Mark } from '@/components/account-profile/mark'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Globe } from 'lucide-react'
import { type ChangeEvent, type DragEvent, type ReactNode, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

import type { Identity } from './accounts'
import { AttachmentArea } from './attachment-area'
import { ComposerToolbar } from './composer-toolbar'
import { insertAt } from './emoji'
import { ACCEPT, type FileKind, splitDrop } from './files'
import { ShortcutsHelp } from './shortcuts-help'
import { modKey } from './shortcuts'
import { TextEditor } from './text-editor'
import { attachmentRefusal, truncateToRoom } from './draft'
import { characterCount, LIMITS, type Attachment } from './rules'
import type { UploadState } from './use-uploads'

type Props = {
   identity: Identity
   accounts: { id: string; label: string }[]
   accountId: string
   onAccount: (id: string) => void
   text: string
   onText: (text: string) => void
   attachment: Attachment | undefined
   urls: ReadonlyMap<string, string>
   uploads: Record<string, UploadState>
   onRetry: (id: string) => void
   // Add files of one kind; gives back what was wrong with the ones that were refused.
   onFiles: (kind: FileKind, picked: File[]) => string[]
   onLink: (url: string) => void
   onAttachAgain: (id: string, kind: 'PHOTOS' | 'VIDEO', file: File) => string[]
   onAlt: (photoId: string, alt: string) => void
   onRemovePhoto: (photoId: string) => void
   onRemove: () => void
   // The saved state and the buttons under the composer.
   footer: ReactNode
}

const LOW = 100

const MOD = typeof navigator === 'undefined' ? 'Ctrl' : modKey(navigator.platform)

// The post writer: who it is from, one big text box, what is attached, a row of buttons to add things, and the footer. It looks and
// works like LinkedIn's, and a file can be dropped anywhere on it.
export const Composer = ({
   identity,
   accounts,
   accountId,
   onAccount,
   text,
   onText,
   attachment,
   urls,
   uploads,
   onRetry,
   onFiles,
   onLink,
   onAttachAgain,
   onAlt,
   onRemovePhoto,
   onRemove,
   footer,
}: Props) => {
   const box = useRef<HTMLTextAreaElement>(null)
   const photos = useRef<HTMLInputElement>(null)
   const video = useRef<HTMLInputElement>(null)
   const documents = useRef<HTMLInputElement>(null)
   const again = useRef<HTMLInputElement>(null)
   const [target, setTarget] = useState<{ id: string; kind: 'PHOTOS' | 'VIDEO' }>()
   const [problems, setProblems] = useState<string[]>([])
   const [dragging, setDragging] = useState(false)
   const [emojiOpen, setEmojiOpen] = useState(false)
   const left = LIMITS.TEXT - characterCount(text)

   const openPicker = (kind: FileKind) => ({ PHOTOS: photos, VIDEO: video, DOCUMENT: documents })[kind].current?.click()

   const picked = (kind: FileKind) => (event: ChangeEvent<HTMLInputElement>) => {
      setProblems(onFiles(kind, Array.from(event.target.files ?? [])))
      event.target.value = ''
   }

   const put = (value: string, caret?: number) => {
      onText(truncateToRoom(value, LIMITS.TEXT))

      if (caret !== undefined) {
         requestAnimationFrame(() => {
            box.current?.focus()
            box.current?.setSelectionRange(caret, caret)
         })
      }
   }

   const pickEmoji = (emoji: string) => {
      const next = insertAt(text, box.current?.selectionStart ?? null, box.current?.selectionEnd ?? null, emoji)

      put(next.value, next.caret)
   }

   // The link of the post, from the toolbar, the selection bar or the shortcut: one rule for all three.
   const link = (url: string) => {
      const refused = attachmentRefusal(attachment, 'LINK')

      setProblems(refused ? [refused] : [])

      if (!refused) {
         onLink(url)
      }

      return !refused
   }

   const drop = (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setDragging(false)

      const { kind, take, problems: refused } = splitDrop(Array.from(event.dataTransfer.files))

      setProblems([...(kind ? onFiles(kind, take) : []), ...refused])
   }

   return (
      <Card
         className="relative gap-0 py-0"
         onDragOver={event => {
            event.preventDefault()
            setDragging(true)
         }}
         onDragLeave={event => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
               setDragging(false)
            }
         }}
         onDrop={drop}
      >
         <input
            ref={photos}
            type="file"
            accept={ACCEPT.PHOTOS}
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={picked('PHOTOS')}
         />
         <input
            ref={video}
            type="file"
            accept={ACCEPT.VIDEO}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={picked('VIDEO')}
         />
         <input
            ref={documents}
            type="file"
            accept={ACCEPT.DOCUMENT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={picked('DOCUMENT')}
         />
         <input
            ref={again}
            type="file"
            accept={target ? ACCEPT[target.kind] : undefined}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={event => {
               const [file] = event.target.files ?? []

               if (file && target) {
                  setProblems(onAttachAgain(target.id, target.kind, file))
               }

               event.target.value = ''
            }}
         />

         <div className="flex items-center gap-3 px-5 pt-5">
            <Mark name={identity.name} imageUrl={identity.imageUrl} className="size-12 text-base" />
            <div className="grid min-w-0 gap-0.5">
               <Select value={accountId} onValueChange={onAccount}>
                  <SelectTrigger
                     aria-label="Post as"
                     className="h-auto w-auto max-w-full gap-1 border-0 bg-transparent p-0 text-base font-semibold shadow-none focus-visible:ring-2 dark:bg-transparent dark:hover:bg-transparent"
                  >
                     <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                     {accounts.map(({ id, label }) => (
                        <SelectItem key={id} value={id}>
                           {id === accountId ? identity.name : label}
                        </SelectItem>
                     ))}
                  </SelectContent>
               </Select>
               <p className="text-muted-foreground flex items-center gap-1 text-xs">
                  <Globe className="size-3" aria-hidden />
                  Post to anyone
               </p>
            </div>
         </div>

         <div className="grid gap-4 px-5 pt-4">
            <TextEditor
               boxRef={box}
               text={text}
               onText={put}
               onLink={link}
               onEmojiPanel={() => setEmojiOpen(true)}
               describedBy="post-count"
            />

            {attachment ? (
               <AttachmentArea
                  attachment={attachment}
                  urls={urls}
                  uploads={uploads}
                  onRetry={onRetry}
                  onAddPhotos={() => openPicker('PHOTOS')}
                  onAttachAgain={(id, kind) => {
                     setTarget({ id, kind })
                     requestAnimationFrame(() => again.current?.click())
                  }}
                  onAlt={onAlt}
                  onRemovePhoto={id => {
                     setProblems([])
                     onRemovePhoto(id)
                  }}
                  onRemove={() => {
                     setProblems([])
                     onRemove()
                     box.current?.focus()
                  }}
               />
            ) : null}

            {problems.length > 0 ? (
               <ul role="alert" className="text-destructive grid gap-0.5 text-xs">
                  {problems.map(problem => (
                     <li key={problem}>{problem}</li>
                  ))}
               </ul>
            ) : null}
         </div>

         <div className="flex items-center justify-between gap-3 px-3 pt-3 pb-3">
            <ComposerToolbar
               attachment={attachment}
               emojiOpen={emojiOpen}
               onEmojiOpenChange={setEmojiOpen}
               onEmoji={pickEmoji}
               onPick={openPicker}
               onLink={url => {
                  link(url)
               }}
            />
            <div className="flex items-center gap-1">
               <p
                  id="post-count"
                  role="status"
                  className={cn('pr-1 text-xs tabular-nums', left <= LOW ? 'text-warning' : 'text-muted-foreground')}
               >
                  {left <= 0 ? 'No room left' : `${left.toLocaleString()} left`}
               </p>
               <ShortcutsHelp mod={MOD} />
            </div>
         </div>

         <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">{footer}</div>

         {dragging ? (
            <div className="border-primary bg-background/80 pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-xl border-2 border-dashed text-sm font-medium">
               Drop to add to your post
            </div>
         ) : null}
      </Card>
   )
}
