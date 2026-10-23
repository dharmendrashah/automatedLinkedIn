import { FileText, Image as ImageIcon, Link2, Mic, Video } from 'lucide-react'

import { cn } from '@/lib/utils'

import { type Attachment, type UniboxMessage } from './types'

import { RichText } from './rich-text'
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

// An attachment as the page can show it: what it is and its name. The spider keeps no copy of a file, so there is nothing to open.
export const AttachmentChip = ({ attachment, own = false }: { attachment: Attachment; own?: boolean }) => {
   const Icon = ICONS[attachment.kind]

   return (
      <span
         className={cn(
            'inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs',
            own ? 'border-primary-foreground/30 bg-primary-foreground/10' : 'bg-muted'
         )}
      >
         <Icon className="size-3.5 shrink-0" aria-hidden />
         <span className="truncate">{attachment.name ?? LABELS[attachment.kind]}</span>
      </span>
   )
}

type Props = {
   message: UniboxMessage
   tokens: string[]
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
                     <AttachmentChip key={index} attachment={attachment} own={own} />
                  ))}
               </div>
            ) : null}
         </div>
      </div>
   )
}
