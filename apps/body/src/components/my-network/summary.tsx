import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sparkles } from 'lucide-react'
import { Link } from 'react-router'

import { type TodayLine } from './types'

import { type RouterOutputs } from '../../trpc'
import { type ViewChange } from './address'
import { COUNT_CAP, RESULT_DAYS, type ResultDays, countText, resultDays } from './rows'

type Go = (change: ViewChange) => void

const LinkButton = ({ onClick, children }: { onClick: () => void; children: string }) => (
   <Button variant="link" size="sm" className="h-auto p-0" onClick={onClick}>
      {children}
   </Button>
)

// "Reply to 2 · Accept 5 · Invite 10 · +12 new since your last visit"; each part opens the people it counts. Accounts whose invites
// stopped get a line of their own.
export const Today = ({ line, onGo }: { line: TodayLine; onGo: Go }) => {
   const parts = [
      line.replies > 0 ? (
         <LinkButton key="reply" onClick={() => onGo({ tab: 'NEEDS_ME', found: null, new: null })}>
            {`Reply to ${countText(line.replies, COUNT_CAP)}`}
         </LinkButton>
      ) : null,
      line.requests > 0 ? (
         <LinkButton key="accept" onClick={() => onGo({ tab: 'NEEDS_ME', found: 'request', new: null })}>
            {`Accept ${countText(line.requests, COUNT_CAP)}`}
         </LinkButton>
      ) : null,
      line.invitesLive && line.invites > 0 ? (
         <LinkButton key="invite" onClick={() => onGo({ tab: 'NEEDS_ME', found: null, new: null })}>
            {`Invite ${countText(line.invites, COUNT_CAP)}`}
         </LinkButton>
      ) : null,
      line.fresh > 0 ? (
         <LinkButton key="new" onClick={() => onGo({ tab: 'EVERYONE', found: null, new: '1' })}>
            {`+${countText(line.fresh, COUNT_CAP)} new since your last visit`}
         </LinkButton>
      ) : null,
   ].filter(Boolean)

   if (parts.length === 0 && line.stopped.length === 0) {
      return null
   }

   return (
      <div className="grid gap-1">
         {parts.length > 0 ? (
            <p className="flex flex-wrap items-center gap-x-2 text-sm" role="status">
               <span className="font-medium">Today:</span>
               {parts.flatMap((part, index) => (index > 0 ? [<span key={`dot-${index}`}>·</span>, part] : [part]))}
            </p>
         ) : null}
         {line.stopped.map(({ accountId, name, reason }) => (
            <p key={accountId} className="text-destructive text-sm" role="alert">
               {`${name}: ${reason}`}
            </p>
         ))}
      </div>
   )
}

// "All clients": one Today line per client; picking a line opens that client.
export const AllClients = ({ lines, onPick }: { lines: TodayLine[]; onPick: (clientId: string) => void }) => (
   <ul className="bg-card divide-y rounded-xl border">
      {lines.map(line => (
         <li key={line.clientId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <Button variant="ghost" size="sm" className="font-semibold" onClick={() => onPick(line.clientId)}>
               {line.name}
            </Button>
            <Today line={line} onGo={() => onPick(line.clientId)} />
         </li>
      ))}
   </ul>
)

type Results = RouterOutputs['people']['results']

const percent = (part: number, whole: number) => (whole > 0 ? ` (${Math.round((part / whole) * 100)}%)` : '')

// "Invited · Accepted (%) · Replied" over 7, 30 or 90 days, shown beside the tabs while invites are live.
export const ResultsLine = ({
   results,
   days,
   onDays,
}: {
   results: Results
   days: ResultDays
   onDays: (days: ResultDays) => void
}) => (
   <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-sm">
      <span>{`Invited ${results.invited}`}</span>
      <span>·</span>
      <span>{`Accepted ${results.accepted}${percent(results.accepted, results.invited)}`}</span>
      <span>·</span>
      <span>{`Replied ${results.replied}`}</span>
      <Select value={String(days)} onValueChange={value => onDays(resultDays(value))}>
         <SelectTrigger size="sm" className="h-7 w-24" aria-label="Results over">
            <SelectValue />
         </SelectTrigger>
         <SelectContent>
            {RESULT_DAYS.map(value => (
               <SelectItem key={value} value={String(value)}>
                  {`${value} days`}
               </SelectItem>
            ))}
         </SelectContent>
      </Select>
   </p>
)

// A client with nobody yet: the guided start finds people for it.
export const FirstVisit = () => (
   <div className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
      <div className="flex items-center gap-3">
         <Sparkles className="text-primary size-5 shrink-0" aria-hidden />
         <p className="text-sm">Tell us who your customer is and we'll find people.</p>
      </div>
      <Button asChild size="sm">
         <Link to="/workflows/new">Start</Link>
      </Button>
   </div>
)
