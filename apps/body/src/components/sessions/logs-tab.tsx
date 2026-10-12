import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useState } from 'react'

import { cn } from '@/lib/utils'

import { type SessionDetail } from './types'

import { Notice } from './recording-gate'
import { type LogEntry, parseLogs } from './recording'
import { useSessionText } from './use-session-file'

const sources = {
   browser: 'Browser page',
   spider: 'Spider',
   engine: 'Browser engine',
} as const

const levelClass = {
   info: 'text-muted-foreground',
   warn: 'text-amber-700 dark:text-amber-400',
   error: 'text-destructive',
}

const Line = ({ entry }: { entry: LogEntry }) => (
   <li className="flex gap-3 px-3 py-1.5 font-mono text-xs">
      <span className="text-muted-foreground w-14 shrink-0 tabular-nums">{(entry.t / 1000).toFixed(1)} s</span>
      <Badge variant="outline" className="h-5 shrink-0 text-[10px]">
         {sources[entry.source]}
      </Badge>
      <span className={cn('min-w-0 break-words whitespace-pre-wrap', levelClass[entry.level])}>{entry.message}</span>
   </li>
)

export const LogsTab = ({ session }: { session: SessionDetail }) => {
   const file = useSessionText(session.id, 'logs.json')
   const [source, setSource] = useState<'all' | LogEntry['source']>('all')
   const [errorsOnly, setErrorsOnly] = useState(false)

   if (file.loading) {
      return <Skeleton className="h-40 w-full rounded-xl" />
   }

   if (file.error) {
      return <Notice>{file.error}</Notice>
   }

   const entries = file.text ? parseLogs(file.text) : []
   const shown = entries.filter(
      entry => (source === 'all' || entry.source === source) && (!errorsOnly || entry.level !== 'info')
   )

   return (
      <div className="grid gap-3">
         <div className="flex flex-wrap items-center justify-between gap-2">
            <ToggleGroup
               type="single"
               variant="outline"
               size="sm"
               value={source}
               onValueChange={value => setSource((value || 'all') as typeof source)}
            >
               <ToggleGroupItem value="all">All</ToggleGroupItem>
               <ToggleGroupItem value="browser">Browser page</ToggleGroupItem>
               <ToggleGroupItem value="spider">Spider</ToggleGroupItem>
               <ToggleGroupItem value="engine">Browser engine</ToggleGroupItem>
            </ToggleGroup>
            <ToggleGroup
               type="single"
               variant="outline"
               size="sm"
               value={errorsOnly ? 'problems' : 'everything'}
               onValueChange={value => setErrorsOnly(value === 'problems')}
            >
               <ToggleGroupItem value="everything">Everything</ToggleGroupItem>
               <ToggleGroupItem value="problems">Problems only</ToggleGroupItem>
            </ToggleGroup>
         </div>

         {shown.length === 0 ? (
            <Notice>{entries.length === 0 ? 'Nothing was logged in this session.' : 'No lines match this filter.'}</Notice>
         ) : (
            <ul className="divide-y rounded-xl border" aria-label="Log lines">
               {shown.map((entry, index) => (
                  <Line key={`${entry.t}-${entry.source}-${index}`} entry={entry} />
               ))}
            </ul>
         )}
      </div>
   )
}
