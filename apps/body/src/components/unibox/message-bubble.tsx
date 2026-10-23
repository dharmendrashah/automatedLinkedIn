import { FileText, Image as ImageIcon, Link2, Mic, Video } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

import { type Attachment, type UniboxMessage } from './types'

import { useObjectUrl, useSeen } from './previews'
import { RichText } from './rich-text'
import { useShared } from './shared'
import { formatFull } from './time'

const ICONS = {
   IMAGE: ImageIcon,
   VIDEO: Video,
   AUDIO: Mic,
   FILE: FileText,
   LINK: Link2,
} as const

const LABELS: Record<Attachment['kind'], string> = {
   IMAGE: 'Image',
   VIDEO: 'Video',
   AUDIO: 'Voice note',
   FILE: 'File',
   LINK: 'Link',
}

// An attachment as the page shows it: what it is and its name, and a button that opens the file when the platform keeps it.
export const AttachmentChip = ({
   attachment,
   own = false,
   onOpen,
}: {
   attachment: Attachment
   own?: boolean
   onOpen?: () => void
}) => {
   const Icon = ICONS[attachment.kind]
   const style = cn(
      'inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs',
      own ? 'border-primary-foreground/30 bg-primary-foreground/10' : 'bg-muted'
   )
   const content = (
      <>
         <Icon className="size-3.5 shrink-0" aria-hidden />
         <span className="truncate">{attachment.name ?? LABELS[attachment.kind]}</span>
      </>
   )

   return onOpen ? (
      <button type="button" onClick={onOpen} className={cn(style, 'cursor-pointer hover:underline')} title="Open">
         {content}
      </button>
   ) : (
      <span className={style}>{content}</span>
   )
}

type Props = {
   message: UniboxMessage
   tokens: string[]
}

// An attachment of a message: a picture is shown as a picture (from the file chosen on this device, or from the kept file through a
// short link asked for when it is about to be seen), anything else is a chip that opens the file when it is kept.
export const AttachmentView = ({
   attachment,
   own = false,
   messageId,
   index,
}: {
   attachment: Attachment
   own?: boolean
   messageId: string
   index: number
}) => {
   const { openFile, fileUrl } = useShared()
   const holder = useRef<HTMLDivElement>(null)
   const seen = useSeen(holder)
   const local = useObjectUrl(attachment.kind === 'IMAGE' ? attachment.file : undefined)
   const [keptUrl, setKeptUrl] = useState<string>()
   const [broken, setBroken] = useState(false)
   const wantsKept = attachment.kind === 'IMAGE' && attachment.kept === true && !attachment.file && fileUrl !== undefined

   useEffect(() => {
      if (!wantsKept || !seen || !fileUrl || keptUrl) {
         return undefined
      }

      let live = true

      fileUrl(messageId, index)
         .then(url => live && setKeptUrl(url))
         .catch(() => live && setBroken(true))

      return () => {
         live = false
      }
   }, [wantsKept, seen, fileUrl, keptUrl, messageId, index])

   const src = local ?? keptUrl
   const open = attachment.kept && openFile ? () => openFile(messageId, index) : undefined

   return (
      <div ref={holder} className="max-w-full">
         {src && !broken ? (
            <button
               type="button"
               onClick={open}
               disabled={!open}
               className={cn('block overflow-hidden rounded-md', open && 'cursor-pointer')}
               title={attachment.name}
            >
               <img
                  src={src}
                  alt={attachment.name ?? 'Image'}
                  loading="lazy"
                  onError={() => setBroken(true)}
                  className="max-h-56 max-w-full object-cover"
               />
            </button>
         ) : (
            <AttachmentChip attachment={attachment} own={own} onOpen={open} />
         )}
      </div>
   )
}

// One message: its words as safe text, its attachments, and its time on hover. Ours are on the right in LinkedIn blue.
export const MessageBubble = ({ message, tokens }: Props) => {
   const own = message.direction === 'ME'

   return (
      <div className={cn('flex w-full', own ? 'justify-end' : 'justify-start')}>
         <div
            title={formatFull(message.at)}
            className={cn(
               'max-w-[min(34rem,85%)] rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap',
               own
                  ? 'rounded-br-md bg-primary text-primary-foreground'
                  : 'rounded-bl-md border bg-card text-card-foreground'
            )}
         >
            {message.text ? (
               <p>
                  <RichText text={message.text} tokens={tokens} />
               </p>
            ) : null}
            {message.attachments.length > 0 ? (
               <div className={cn('flex flex-wrap gap-1.5', message.text && 'mt-1.5')}>
                  {message.attachments.map((attachment, index) => (
                     <AttachmentView
                        key={index}
                        attachment={attachment}
                        own={own}
                        messageId={message.id}
                        index={index}
                     />
                  ))}
               </div>
            ) : null}
         </div>
      </div>
   )
}
