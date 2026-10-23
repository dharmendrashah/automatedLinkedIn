import { CornerUpLeft, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { type UniboxConversation } from './types'

import { AttachmentView } from './message-bubble'
import { sendingStatus } from './sending-status'

type Props = {
   sending: NonNullable<UniboxConversation['sending']>
   now: number
   canUndo: boolean
   onUndo: () => void
}

// The reply being sent, as the owner's own bubble: its words, its files, and how far it is. While LinkedIn works there is no real percent,
// so the bar only moves and the line says since when it waits.
export const SendingBubble = ({ sending, now, canUndo, onUndo }: Props) => {
   const { line, bar } = sendingStatus(sending, now)

   return (
      <div className="mb-3 flex justify-end" role="status">
         <div className="flex max-w-[min(34rem,85%)] flex-col gap-1.5 rounded-2xl rounded-br-md bg-primary/60 px-3.5 py-2 text-sm text-primary-foreground">
            <div className="flex items-center gap-2">
               <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
               <span className="min-w-0 break-words whitespace-pre-wrap">
                  {sending.text || (sending.attachments.length > 0 ? 'Sending files' : 'Attachment')}
               </span>
               {canUndo ? (
                  <Button variant="secondary" size="xs" onClick={onUndo}>
                     <CornerUpLeft /> Undo
                  </Button>
               ) : null}
            </div>
            {sending.attachments.length > 0 ? (
               <div className="flex flex-wrap gap-1.5">
                  {sending.attachments.map((attachment, index) => (
                     <AttachmentView key={index} attachment={attachment} own messageId="" index={index} />
                  ))}
               </div>
            ) : null}
            {line ? <p className="text-xs opacity-90">{line}</p> : null}
            {bar ? (
               <div
                  role="progressbar"
                  aria-label={line}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={bar.percent}
                  className="relative h-1 overflow-hidden rounded-full bg-primary-foreground/30"
               >
                  {bar.percent === undefined ? (
                     <div className="absolute inset-y-0 left-0 w-1/3 animate-[indeterminate_1.4s_ease-in-out_infinite] rounded-full bg-primary-foreground motion-reduce:animate-none" />
                  ) : (
                     <div
                        className="h-full bg-primary-foreground transition-[width]"
                        style={{ width: `${bar.percent}%` }}
                     />
                  )}
               </div>
            ) : null}
         </div>
      </div>
   )
}
