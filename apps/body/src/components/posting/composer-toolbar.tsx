import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FileText, ImagePlus, Link2, type LucideIcon, Smile, Video } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { attachmentRefusal } from './draft'
import { EMOJI_GROUPS } from './emoji'
import { type FileKind } from './files'
import { addressProblem, normaliseAddress } from './link-text'
import type { Attachment } from './rules'

const Tip = ({ text, children }: { text: string; children: ReactNode }) => (
   <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
   </Tooltip>
)

const FILE_TOOLS: { kind: FileKind; label: string; icon: LucideIcon }[] = [
   {
      kind: 'PHOTOS',
      label: 'Add photos',
      icon: ImagePlus,
   },
   {
      kind: 'VIDEO',
      label: 'Add a video',
      icon: Video,
   },
   {
      kind: 'DOCUMENT',
      label: 'Add a document',
      icon: FileText,
   },
]

const EmojiTool = ({
   open,
   onOpenChange,
   onPick,
}: {
   open: boolean
   onOpenChange: (open: boolean) => void
   onPick: (emoji: string) => void
}) => (
   <Popover open={open} onOpenChange={onOpenChange}>
      <Tip text="Add an emoji">
         <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Add an emoji">
               <Smile />
            </Button>
         </PopoverTrigger>
      </Tip>
      <PopoverContent align="start" className="w-80 p-3">
         <div className="grid max-h-72 gap-3 overflow-y-auto">
            {EMOJI_GROUPS.map(({ name, items }) => (
               <section key={name} aria-label={name} className="grid gap-1">
                  <h3 className="text-muted-foreground text-xs font-medium">{name}</h3>
                  <div className="grid grid-cols-8 gap-1">
                     {items.map(({ emoji, name: label }) => (
                        <button
                           key={emoji}
                           type="button"
                           title={`:${label}:`}
                           aria-label={label.replaceAll('_', ' ')}
                           className="hover:bg-accent focus-visible:ring-ring grid size-8 place-items-center rounded-md text-lg focus-visible:ring-2 focus-visible:outline-none"
                           onClick={() => onPick(emoji)}
                        >
                           {emoji}
                        </button>
                     ))}
                  </div>
               </section>
            ))}
         </div>
      </PopoverContent>
   </Popover>
)

const LinkForm = ({ onAdd }: { onAdd: (url: string) => void }) => {
   const [url, setUrl] = useState('')
   const checked = normaliseAddress(url)
   const problem = addressProblem(url)

   return (
      <form
         className="grid gap-2"
         onSubmit={event => {
            event.preventDefault()

            if (checked) {
               onAdd(checked)
            }
         }}
      >
         <label htmlFor="post-link" className="text-sm font-medium">
            Address of the link
         </label>
         <Input
            id="post-link"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://example.com/article"
            aria-invalid={Boolean(problem)}
            value={url}
            onChange={event => setUrl(event.target.value.trim())}
         />
         <p className={problem ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}>
            {problem ?? 'It shows as the site and the address. Nothing is opened from here.'}
         </p>
         <Button type="submit" size="sm" disabled={!checked}>
            Add link
         </Button>
      </form>
   )
}

const LinkTool = ({ reason, onAdd }: { reason: string | undefined; onAdd: (url: string) => void }) => {
   const [open, setOpen] = useState(false)

   if (reason) {
      return (
         <Tip text={reason}>
            <span tabIndex={0} className="inline-flex">
               <Button type="button" variant="ghost" size="icon" disabled aria-label="Add a link">
                  <Link2 />
               </Button>
            </span>
         </Tip>
      )
   }

   return (
      <Popover open={open} onOpenChange={setOpen}>
         <Tip text="Add a link">
            <PopoverTrigger asChild>
               <Button type="button" variant="ghost" size="icon" aria-label="Add a link">
                  <Link2 />
               </Button>
            </PopoverTrigger>
         </Tip>
         <PopoverContent align="start" className="w-80">
            <LinkForm
               onAdd={url => {
                  onAdd(url)
                  setOpen(false)
               }}
            />
         </PopoverContent>
      </Popover>
   )
}

type Props = {
   attachment: Attachment | undefined
   emojiOpen: boolean
   onEmojiOpenChange: (open: boolean) => void
   onEmoji: (emoji: string) => void
   onPick: (kind: FileKind) => void
   onLink: (url: string) => void
}

// One row of icon buttons, as LinkedIn has under its text box. A kind that cannot be added now is switched off and says why.
export const ComposerToolbar = ({ attachment, emojiOpen, onEmojiOpenChange, onEmoji, onPick, onLink }: Props) => (
   <div className="flex items-center gap-1" role="toolbar" aria-label="Add to your post">
      <EmojiTool open={emojiOpen} onOpenChange={onEmojiOpenChange} onPick={onEmoji} />
      {FILE_TOOLS.map(({ kind, label, icon: Icon }) => {
         const reason = attachmentRefusal(attachment, kind)

         return reason ? (
            <Tip key={kind} text={reason}>
               <span tabIndex={0} className="inline-flex">
                  <Button type="button" variant="ghost" size="icon" disabled aria-label={label}>
                     <Icon />
                  </Button>
               </span>
            </Tip>
         ) : (
            <Tip key={kind} text={label}>
               <Button type="button" variant="ghost" size="icon" aria-label={label} onClick={() => onPick(kind)}>
                  <Icon />
               </Button>
            </Tip>
         )
      })}
      <LinkTool reason={attachmentRefusal(attachment, 'LINK')} onAdd={onLink} />
   </div>
)
