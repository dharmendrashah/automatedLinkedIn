import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import {
   FileText,
   Image as ImageIcon,
   Link2,
   MessageSquareText,
   Mic,
   Paperclip,
   Send,
   TriangleAlert,
   Video,
   X,
} from 'lucide-react'
import {
   type CSSProperties,
   type ClipboardEvent,
   type DragEvent,
   type KeyboardEvent,
   type RefObject,
   useEffect,
   useRef,
   useState,
} from 'react'

import { cn } from '@/lib/utils'

import { type Attachment, type AttachmentKind, type UniboxAccount, type UniboxConversation } from './types'

import { AccountAvatar } from './account-avatar'
import { ACCEPT, LIMITS, checkAttachment, formatBytes, kindOfFile, sendableKind } from './attachments'
import { hueOf } from './colors'
import { useShared } from './shared'
import { TEMPLATES, fillTemplate, firstName } from './templates'
import { formatClock } from './time'
import { VoiceRecorder } from './voice-recorder'

type Pending = {
   id: number
   attachment: Attachment
   // 0 to 100: how much of the file went up (an imitation here; the real upload will report it).
   progress: number
}

type Props = {
   conversation: UniboxConversation
   account: UniboxAccount | undefined
   draft: string
   onDraft: (text: string) => void
   onSend: (text: string, attachments: Attachment[]) => void
   // Why nothing can be sent from this account, when that is so.
   blockedReason: string | undefined
   // Something worth knowing before replying, e.g. that the same person was already answered from another account.
   notice: string | undefined
   textareaRef: RefObject<HTMLTextAreaElement | null>
}

const PICKS: { kind: Exclude<AttachmentKind, 'LINK'>; label: string; accept: string; icon: typeof ImageIcon }[] = [
   { kind: 'IMAGE', label: 'Image', accept: ACCEPT.IMAGE, icon: ImageIcon },
   { kind: 'VIDEO', label: 'Video', accept: ACCEPT.VIDEO, icon: Video },
   { kind: 'AUDIO', label: 'Audio file (LinkedIn may refuse it)', accept: ACCEPT.AUDIO, icon: Mic },
   { kind: 'FILE', label: 'Document', accept: ACCEPT.FILE, icon: FileText },
]

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)
const SEND_KEYS = MAC ? '⌘ Enter' : 'Ctrl Enter'
const VARIABLE = /\{\s*[^{}\s][^{}]*\}/g

const asUrl = (text: string) => {
   try {
      const url = new URL(text.trim())

      return url.protocol === 'http:' || url.protocol === 'https:' ? url : undefined
   } catch {
      return undefined
   }
}

// Where the owner writes the reply. It always says which account the reply goes from, and who it goes to. Enter is a new line;
// Ctrl or Cmd Enter, or the Send button, sends.
export const Composer = ({
   conversation,
   account,
   draft,
   onDraft,
   onSend,
   blockedReason,
   notice,
   textareaRef,
}: Props) => {
   const { ambiguousNames } = useShared()
   const [pending, setPending] = useState<Pending[]>([])
   const [recording, setRecording] = useState(false)
   const [problems, setProblems] = useState<string[]>([])
   const [dragging, setDragging] = useState(false)
   const [linkOpen, setLinkOpen] = useState(false)
   const [link, setLink] = useState('')
   const [templatesOpen, setTemplatesOpen] = useState(false)
   const picker = useRef<HTMLInputElement>(null)
   const nextId = useRef(1)
   const uploading = pending.some(item => item.progress < 100)
   const blank = !draft.trim() && pending.length === 0
   const over = draft.length > LIMITS.TEXT
   const sending = conversation.sending !== undefined
   const variables = [...new Set(draft.match(VARIABLE) ?? [])]
   const group = conversation.kind === 'GROUP'
   const label = account
      ? ambiguousNames.has(account.name)
         ? `${account.name} (${account.handle})`
         : account.name
      : 'an unknown account'
   const disabled = blockedReason !== undefined || sending

   // The imitation of an upload: a file fills in a moment, so what Send waits for can be seen.
   useEffect(() => {
      if (!uploading) {
         return undefined
      }

      const timer = setInterval(
         () => setPending(items => items.map(item => ({ ...item, progress: Math.min(100, item.progress + 25) }))),
         160
      )

      return () => clearInterval(timer)
   }, [uploading])

   useEffect(() => {
      if (problems.length === 0) {
         return undefined
      }

      const timer = setTimeout(() => setProblems([]), 7000)

      return () => clearTimeout(timer)
   }, [problems])

   const add = (attachments: Attachment[], skipped: string[] = []) => {
      let count = pending.length
      const accepted: Pending[] = []
      const refused = [...skipped]

      for (const attachment of attachments) {
         const check = checkAttachment(attachment.kind, attachment.bytes ?? 1, count, attachment.name)

         if (check.ok) {
            count += 1
            accepted.push({
               id: nextId.current++,
               attachment,
               progress: attachment.kind === 'LINK' ? 100 : 0,
            })
         } else {
            refused.push(`${attachment.name ?? 'The file'}: ${check.reason}`)
         }
      }

      setPending(items => [...items, ...accepted])
      setProblems(refused)
   }

   const addFiles = (files: File[]) =>
      add(
         files.map(file => ({
            kind: sendableKind(file.name) ?? kindOfFile(file),
            name: file.name,
            bytes: file.size,
            file,
         }))
      )

   const pick = (accept: string) => {
      if (picker.current) {
         picker.current.accept = accept
         picker.current.click()
      }
   }

   const submit = () => {
      if (disabled || blank || uploading || over) {
         return
      }

      onSend(
         draft,
         pending.map(item => item.attachment)
      )
      setPending([])
      setProblems([])
   }

   const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
         event.preventDefault()
         submit()
      }
   }

   const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const files = [...event.clipboardData.files].filter(file => kindOfFile(file) === 'IMAGE')

      if (files.length > 0) {
         event.preventDefault()
         addFiles(files)
      }
   }

   const onDrop = (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setDragging(false)

      if (!disabled) {
         addFiles([...event.dataTransfer.files])
      }
   }

   const addLink = () => {
      const url = asUrl(link)

      if (!url) {
         setProblems(['A link starts with http:// or https://.'])

         return
      }

      add([{ kind: 'LINK', name: url.href }])
      setLink('')
      setLinkOpen(false)
   }

   const applyTemplate = (body: string) => {
      const { text } = fillTemplate(body, {
         'first name': firstName(conversation.contact.name),
         account: account?.name,
      })

      onDraft(draft.trim() ? `${draft.trimEnd()}\n\n${text}` : text)
      setTemplatesOpen(false)
      textareaRef.current?.focus()
   }

   return (
      <div
         onDragOver={event => {
            event.preventDefault()
            setDragging(true)
         }}
         onDragLeave={() => setDragging(false)}
         onDrop={onDrop}
         className={cn(
            'space-y-2 border-t bg-card p-3',
            dragging && 'bg-primary/5 outline-2 -outline-offset-2 outline-primary outline-dashed'
         )}
      >
         <div
            style={{ '--h': account ? hueOf(account.id) : 0 } as CSSProperties}
            className="flex items-center gap-2 rounded-md border-l-4 border-l-[oklch(0.6_0.15_var(--h))] bg-muted/50 px-2 py-1 text-xs"
         >
            <AccountAvatar account={account} size="sm" />
            <span className="min-w-0 flex-1 truncate">
               Replying as <strong className="font-semibold">{label}</strong>{' '}
               {group ? (
                  `to the group (${conversation.participants.length} people)`
               ) : (
                  <>
                     to <strong className="font-semibold">{conversation.contact.name}</strong>
                  </>
               )}
            </span>
         </div>
         {blockedReason ? (
            <p
               role="alert"
               className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-xs text-warning"
            >
               <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
               {blockedReason}
            </p>
         ) : null}
         {notice ? <p className="rounded-md bg-info/10 px-2 py-1 text-xs text-info">{notice}</p> : null}
         {recording ? (
            <VoiceRecorder
               onCancel={() => setRecording(false)}
               onDone={seconds => {
                  setRecording(false)
                  setProblems([
                     `A voice note of ${formatClock(seconds)} cannot be sent from here: LinkedIn takes voice messages only in its own app. Attach an audio file instead.`,
                  ])
               }}
            />
         ) : null}
         {pending.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Attachments">
               {pending.map(({ id, attachment, progress }) => (
                  <li
                     key={id}
                     className="relative flex max-w-64 items-center gap-1.5 overflow-hidden rounded-md border bg-background px-2 py-1 text-xs"
                  >
                     <span className="truncate">{attachment.name}</span>
                     {attachment.bytes ? (
                        <span className="shrink-0 text-muted-foreground">{formatBytes(attachment.bytes)}</span>
                     ) : null}
                     <button
                        type="button"
                        onClick={() => setPending(items => items.filter(item => item.id !== id))}
                        aria-label={`Remove ${attachment.name ?? 'the attachment'}`}
                        className="shrink-0 rounded-sm text-muted-foreground hover:text-foreground"
                     >
                        <X className="size-3.5" />
                     </button>
                     {progress < 100 ? (
                        <span
                           aria-hidden
                           className="absolute bottom-0 left-0 h-0.5 bg-primary transition-[width]"
                           style={{ width: `${progress}%` }}
                        />
                     ) : null}
                  </li>
               ))}
            </ul>
         ) : null}
         {problems.length > 0 ? (
            <ul role="alert" className="space-y-0.5 text-xs text-destructive">
               {problems.map(problem => (
                  <li key={problem}>{problem}</li>
               ))}
            </ul>
         ) : null}
         <Textarea
            ref={textareaRef}
            value={draft}
            disabled={disabled}
            onChange={event => onDraft(event.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            rows={2}
            placeholder={sending ? 'Sending...' : `Write to ${conversation.contact.name}`}
            aria-label={`Reply to ${conversation.contact.name}`}
            aria-invalid={over}
            className="max-h-60 min-h-[3.5rem] resize-none bg-background"
         />
         {variables.length > 0 ? (
            <p className="flex items-center gap-1.5 text-xs text-warning">
               <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
               Fill in {variables.join(', ')} before you send.
            </p>
         ) : null}
         <div className="flex flex-wrap items-center gap-1">
            <input
               ref={picker}
               type="file"
               multiple
               hidden
               onChange={event => {
                  addFiles([...(event.target.files ?? [])])
                  event.target.value = ''
               }}
            />
            <DropdownMenu>
               <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" disabled={disabled}>
                     <Paperclip /> Attach
                  </Button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="start">
                  {PICKS.map(({ kind, label: name, accept, icon: Icon }) => (
                     <DropdownMenuItem key={kind} onSelect={() => pick(accept)}>
                        <Icon /> {name}
                     </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem onSelect={() => setRecording(true)}>
                     <Mic /> Record a voice note
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setLinkOpen(true)}>
                     <Link2 /> Link
                  </DropdownMenuItem>
               </DropdownMenuContent>
            </DropdownMenu>
            <Popover open={linkOpen} onOpenChange={setLinkOpen}>
               <PopoverTrigger asChild>
                  <span aria-hidden />
               </PopoverTrigger>
               <PopoverContent align="start" className="w-80">
                  <form
                     className="flex gap-2"
                     onSubmit={event => {
                        event.preventDefault()
                        addLink()
                     }}
                  >
                     <Input
                        value={link}
                        onChange={event => setLink(event.target.value)}
                        placeholder="https://"
                        aria-label="Link address"
                        autoFocus
                     />
                     <Button type="submit" size="sm">
                        Add
                     </Button>
                  </form>
               </PopoverContent>
            </Popover>
            <Popover open={templatesOpen} onOpenChange={setTemplatesOpen}>
               <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" disabled={disabled}>
                     <MessageSquareText /> Templates
                  </Button>
               </PopoverTrigger>
               <PopoverContent align="start" className="w-80 p-0">
                  <Command>
                     <CommandList>
                        <CommandEmpty>No template.</CommandEmpty>
                        <CommandGroup heading="Templates">
                           {TEMPLATES.map(template => (
                              <CommandItem
                                 key={template.id}
                                 value={template.name}
                                 onSelect={() => applyTemplate(template.body)}
                                 className="flex-col items-start gap-0"
                              >
                                 <span className="text-sm font-medium">{template.name}</span>
                                 <span className="line-clamp-2 text-xs text-muted-foreground">{template.body}</span>
                              </CommandItem>
                           ))}
                        </CommandGroup>
                     </CommandList>
                  </Command>
               </PopoverContent>
            </Popover>
            <span className="ml-auto hidden text-[11px] whitespace-nowrap text-muted-foreground sm:inline">
               <kbd className="rounded border bg-muted px-1 font-sans">{SEND_KEYS}</kbd> to send
            </span>
            {draft.length > LIMITS.TEXT * 0.8 ? (
               <span
                  className={cn(
                     'text-xs tabular-nums',
                     over ? 'font-medium text-destructive' : 'text-muted-foreground'
                  )}
                  aria-live="polite"
               >
                  {draft.length.toLocaleString('en-US')} / {LIMITS.TEXT.toLocaleString('en-US')}
               </span>
            ) : null}
            <Button size="sm" onClick={submit} disabled={disabled || blank || uploading || over} className="sm:ml-2">
               <Send /> {uploading ? 'Uploading...' : 'Send'}
            </Button>
         </div>
      </div>
   )
}
