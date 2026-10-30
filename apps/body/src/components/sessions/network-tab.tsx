import { TextBlock } from '@/components/text-block'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useState } from 'react'

import { cn } from '@/lib/utils'

import { type SessionDetail } from './types'

import { formatBody, formatHeaders } from '../proxies/format'
import { shortAddress } from './describe'
import { type NetworkEntry, parseNetwork } from './recording'
import { Notice } from './recording-gate'
import { useSessionText } from './use-session-file'

const statusTone = (entry: NetworkEntry) => {
   if (entry.status === null || entry.status >= 400) {
      return 'bg-destructive/10 text-destructive'
   }

   return entry.status >= 300 ? 'bg-warning/10 text-warning' : ''
}

const Row = ({ entry }: { entry: NetworkEntry }) => {
   const [open, setOpen] = useState(false)

   return (
      <li className="rounded-xl border">
         <button
            type="button"
            onClick={() => setOpen(current => !current)}
            aria-expanded={open}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left"
         >
            <span className="w-12 shrink-0 font-mono text-xs font-medium">{entry.method}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-xs" title={entry.url}>
               {shortAddress(entry.url)}
            </span>
            <Badge variant="outline" className={cn('tabular-nums', statusTone(entry))}>
               {entry.status ?? 'Failed'}
            </Badge>
            <span className="text-muted-foreground w-14 shrink-0 text-right text-xs tabular-nums">
               {entry.durationMs === undefined ? '' : `${entry.durationMs} ms`}
            </span>
         </button>

         {open ? (
            <div className="grid gap-4 border-t px-4 py-3">
               <TextBlock title="Address">{entry.url}</TextBlock>
               {entry.failure ? <TextBlock title="Why it failed">{entry.failure}</TextBlock> : null}
               <TextBlock title="Request headers">{formatHeaders(entry.requestHeaders)}</TextBlock>
               <TextBlock title="Response headers">{formatHeaders(entry.responseHeaders)}</TextBlock>
               {entry.status !== null ? (
                  <TextBlock title="Response">
                     {entry.bodyDropped
                        ? '(left out: this run had already recorded a lot of text)'
                        : formatBody(entry.body ?? null, entry.bodyTruncated ?? false)}
                  </TextBlock>
               ) : null}
            </div>
         ) : null}
      </li>
   )
}

export const NetworkTab = ({ session }: { session: SessionDetail }) => {
   const file = useSessionText(session, 'network.json')

   if (file.loading) {
      return <Skeleton className="h-40 w-full rounded-xl" />
   }

   if (file.error) {
      return <Notice>{file.error}</Notice>
   }

   const entries = file.text ? parseNetwork(file.text) : []

   if (entries.length === 0) {
      return <Notice>No requests were recorded for this session.</Notice>
   }

   return (
      <div className="grid gap-3">
         <p className="text-muted-foreground text-xs">
            Cookie and token values are hidden. What was typed into forms is never recorded.
         </p>
         <ul className="grid gap-2" aria-label="Requests">
            {entries.map(entry => (
               <Row key={`${entry.t}-${entry.method}-${entry.url}`} entry={entry} />
            ))}
         </ul>
      </div>
   )
}
