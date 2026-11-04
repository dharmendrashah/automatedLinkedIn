import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import { checkWords } from '@automatedLinkedIn/contracts'
import { Check, ChevronDown, X } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

import { type RouterOutputs } from '../../trpc/trpc'
import { REJECT_REASONS, type RejectReason } from './reject-reasons'

export type Draft = RouterOutputs['draft']['list']['items'][number]

const KIND_WORDS: Record<Draft['kind'], string> = {
   COMMENT: 'Comment',
   MESSAGE: 'Message',
   REPLY: 'Reply',
}

const HOUR_MS = 60 * 60 * 1000

const timeLeft = (expiresAt: string | Date, now = Date.now()) => {
   const hours = Math.floor((new Date(expiresAt).getTime() - now) / HOUR_MS)

   return hours >= 1 ? `${hours} h left` : 'under an hour left'
}

type Rules = { avoid: string[]; recent: string[] }

type Props = {
   draft: Draft
   rules: Rules
   active: boolean
   selected: boolean
   editing: boolean
   busy: boolean
   onSelect: (on: boolean) => void
   onEdit: (on: boolean) => void
   onApprove: (words?: string) => void
   onReject: (reason: RejectReason) => void
}

// One draft: who and what it is about, the words, and Approve, Edit and Reject on one line. An edit shows every check as the owner types
// and cannot be saved while one fails.
export const DraftCard = ({
   draft,
   rules,
   active,
   selected,
   editing,
   busy,
   onSelect,
   onEdit,
   onApprove,
   onReject,
}: Props) => {
   const [text, setText] = useState(draft.words ?? '')
   const waiting = draft.state === 'DRAFTED'
   const checks = checkWords({
      text,
      maxChars: draft.maxChars,
      avoid: rules.avoid,
      recent: rules.recent.filter(each => each !== draft.words),
   })
   const valid = checks.every(({ ok }) => ok)
   const { card } = draft

   return (
      <li className={cn('grid gap-2 rounded-xl border px-4 py-3 text-sm', active && 'ring-ring ring-2')}>
         <div className="flex flex-wrap items-center gap-2">
            {waiting ? (
               <Checkbox checked={selected} aria-label="Select" onCheckedChange={next => onSelect(next === true)} />
            ) : null}
            <Badge variant="outline">{KIND_WORDS[draft.kind]}</Badge>
            {draft.mode === 'AI' ? <Badge variant="secondary">AI</Badge> : null}
            <span className="font-medium">{card?.authorName ?? draft.slug}</span>
            {card?.authorHeadline ? <span className="text-muted-foreground">{card.authorHeadline}</span> : null}
            <span className="text-muted-foreground ml-auto">
               {waiting ? timeLeft(draft.expiresAt) : draft.state.toLowerCase()}
            </span>
         </div>
         {card?.excerpt ? (
            <p className="text-muted-foreground line-clamp-3">
               {`Post: "${card.excerpt}"`}{' '}
               <a className="underline" href={card.postUrl} target="_blank" rel="noreferrer">
                  Open post
               </a>
            </p>
         ) : null}
         {editing ? (
            <div className="grid gap-2">
               <Textarea
                  aria-label="Words"
                  value={text}
                  onChange={event => setText(event.target.value)}
                  autoFocus
               />
               <p className="text-muted-foreground text-xs">{`${text.trim().length} / ${draft.maxChars}`}</p>
               <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {checks.map(({ key, label, ok }) => (
                     <li key={key} className={ok ? 'text-muted-foreground' : 'text-destructive'}>
                        {ok ? <Check className="inline size-3" /> : <X className="inline size-3" />} {label}
                     </li>
                  ))}
               </ul>
               <div className="flex gap-2">
                  <Button size="sm" disabled={!valid || busy} onClick={() => onApprove(text.trim())}>
                     Save and approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onEdit(false)}>
                     Cancel
                  </Button>
               </div>
            </div>
         ) : (
            <p>{`Draft: "${draft.words ?? 'cleared after 30 days'}"`}</p>
         )}
         {draft.reason ? <p className="text-muted-foreground text-xs">{draft.reason}</p> : null}
         {draft.state === 'REJECTED' && draft.rejectReason ? (
            <p className="text-muted-foreground text-xs">
               {`Rejected: ${REJECT_REASONS[draft.rejectReason as RejectReason] ?? draft.rejectReason}`}
            </p>
         ) : null}
         {draft.state === 'APPROVED' ? (
            <p className="text-muted-foreground text-xs">
               {draft.startedRunId ? 'A run took it. The comment waits in the queue of the account.' : 'Waiting for "When I approve".'}
            </p>
         ) : null}
         {waiting && !editing ? (
            <div className="flex flex-wrap gap-2">
               <Button size="sm" disabled={busy} onClick={() => onApprove()}>
                  Approve
               </Button>
               <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                     setText(draft.words ?? '')
                     onEdit(true)
                  }}
               >
                  Edit
               </Button>
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <Button size="sm" variant="outline" disabled={busy}>
                        Reject
                        <ChevronDown />
                     </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                     {(Object.keys(REJECT_REASONS) as RejectReason[]).map(reason => (
                        <DropdownMenuItem key={reason} onSelect={() => onReject(reason)}>
                           {REJECT_REASONS[reason]}
                        </DropdownMenuItem>
                     ))}
                  </DropdownMenuContent>
               </DropdownMenu>
            </div>
         ) : null}
      </li>
   )
}
