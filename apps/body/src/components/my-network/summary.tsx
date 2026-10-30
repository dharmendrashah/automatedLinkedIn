import { Button } from '@/components/ui/button'
import { Sparkles } from 'lucide-react'
import { Link } from 'react-router'

import { type TodayLine } from './types'
import { formatUsd } from '@/components/workflows/types'

import { type ViewChange } from './address'
import { COUNT_CAP, countText } from './rows'

type Go = (change: ViewChange) => void

const LinkButton = ({ onClick, children }: { onClick: () => void; children: string }) => (
   <Button variant="link" size="sm" className="h-auto p-0" onClick={onClick}>
      {children}
   </Button>
)

// "Reply to 2 · Accept 5 · +12 new since your last visit"; each part opens the people it counts.
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
      line.fresh > 0 ? (
         <LinkButton key="new" onClick={() => onGo({ tab: 'EVERYONE', found: null, new: '1' })}>
            {`+${countText(line.fresh, COUNT_CAP)} new since your last visit`}
         </LinkButton>
      ) : null,
   ].filter(Boolean)

   return (
      <p className="flex flex-wrap items-center gap-x-2 text-sm" role="status">
         <span className="font-medium">Today:</span>
         {parts.length > 0
            ? parts.flatMap((part, index) => (index > 0 ? [<span key={`dot-${index}`}>·</span>, part] : [part]))
            : 'All done for today.'}
      </p>
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

type Results = { newThisWeek: number; dataSpentMicros: number; cap: number }

export const ResultsLine = ({ results, onNew }: { results: Results; onNew: () => void }) => (
   <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-sm">
      <LinkButton onClick={onNew}>{`New this week: ${countText(results.newThisWeek, results.cap)}`}</LinkButton>
      <span>·</span>
      <Link to="/usage" className="hover:text-foreground underline-offset-4 hover:underline">
         Data spent this month: {formatUsd(results.dataSpentMicros)}
      </Link>
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
