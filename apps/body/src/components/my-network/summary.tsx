import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { type TodayLine } from './types'
import { formatUsd } from '@/components/workflows/types'

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
   const waiting =
      line.waitingInvites > 0
         ? ` ${line.waitingInvites} ${line.waitingInvites === 1 ? 'invite is' : 'invites are'} waiting for an answer.`
         : ''

   return (
      <div className="grid gap-1">
         <p className="flex flex-wrap items-center gap-x-2 text-sm" role="status">
            <span className="font-medium">Today:</span>
            {parts.length > 0
               ? parts.flatMap((part, index) => (index > 0 ? [<span key={`dot-${index}`}>·</span>, part] : [part]))
               : `All done for today.${waiting}`}
         </p>
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

const perAccept = (micros: number | null) => (micros === null ? 'n/a' : formatUsd(micros))

const ResultsTable = ({ title, rows }: { title: string; rows: Results['byAccount'] }) => (
   <Table>
      <TableHeader>
         <TableRow>
            <TableHead>{title}</TableHead>
            <TableHead className="text-right">Invited</TableHead>
            <TableHead className="text-right">Accepted</TableHead>
            <TableHead className="text-right">Replied</TableHead>
            <TableHead className="text-right">Data spent</TableHead>
            <TableHead className="text-right">Cost per accept</TableHead>
         </TableRow>
      </TableHeader>
      <TableBody>
         {rows.map(row => (
            <TableRow key={row.key}>
               <TableCell>{row.name}</TableCell>
               <TableCell className="text-right tabular-nums">{row.invited}</TableCell>
               <TableCell className="text-right tabular-nums">{row.accepted}</TableCell>
               <TableCell className="text-right tabular-nums">{row.replied}</TableCell>
               <TableCell className="text-right tabular-nums">{formatUsd(row.spentMicros)}</TableCell>
               <TableCell className="text-right tabular-nums">{perAccept(row.perAcceptMicros)}</TableCell>
            </TableRow>
         ))}
      </TableBody>
   </Table>
)

// "New this week · Data spent this month", and with invites live "Invited · Accepted (%) · Replied" over 7, 30 or 90 days, with the
// same by account and by the source that led to each invite.
export const ResultsLine = ({
   results,
   invitesLive,
   days,
   onDays,
   onNew,
}: {
   results: Results
   invitesLive: boolean
   days: ResultDays
   onDays: (days: ResultDays) => void
   onNew: () => void
}) => {
   const [details, setDetails] = useState(false)

   return (
      <div className="grid gap-2">
         <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-sm">
            <LinkButton onClick={onNew}>{`New this week: ${countText(results.newThisWeek, results.cap)}`}</LinkButton>
            <span>·</span>
            {invitesLive ? (
               <>
                  <span>{`Invited ${results.invited}`}</span>
                  <span>·</span>
                  <span>{`Accepted ${results.accepted}${percent(results.accepted, results.invited)}`}</span>
                  <span>·</span>
                  <span>{`Replied ${results.replied}`}</span>
                  <span>·</span>
               </>
            ) : null}
            <Link to="/usage" className="hover:text-foreground underline-offset-4 hover:underline">
               Data spent this month: {formatUsd(results.dataSpentMicros)}
            </Link>
            {invitesLive ? (
               <>
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
                  <LinkButton onClick={() => setDetails(!details)}>{details ? 'Hide details' : 'Details'}</LinkButton>
               </>
            ) : null}
         </p>
         {invitesLive && details ? (
            <div className="bg-card grid gap-2 rounded-xl border p-2">
               <ResultsTable title="Account" rows={results.byAccount} />
               <ResultsTable title="Found by" rows={results.bySource} />
            </div>
         ) : null}
      </div>
   )
}

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
