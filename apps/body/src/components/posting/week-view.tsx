import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { cn } from '@/lib/utils'

import { type Account } from '../accounts/types'

import { accountName } from './accounts'
import { type Labels, readyAccounts } from './landing'
import { type Entry, byCell, startOfWeek, weekDays } from './week'

type Props = {
   accounts: Account[]
   entries: Entry[]
   labels: Labels
}

const KIND: Record<Entry['kind'], { text: string; className: string }> = {
   planned: { text: 'Planned', className: 'bg-secondary text-secondary-foreground' },
   posted: { text: 'Posted', className: 'bg-primary/10 text-primary' },
   failed: { text: 'Not posted', className: 'bg-destructive/10 text-destructive' },
   draft: { text: 'Draft with a time', className: 'border border-dashed' },
}

const clock = (at: Date) => at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

const Pill = ({ entry }: { entry: Entry }) => {
   const body = (
      <>
         <span className="font-medium tabular-nums">{clock(entry.at)}</span>{' '}
         <span dir="auto">{entry.text || 'No words'}</span>
      </>
   )
   const className = cn('block truncate rounded-md px-2 py-1 text-xs', KIND[entry.kind].className)

   return entry.kind === 'draft' ? (
      <Link to={`/posting/${entry.accountId}/${entry.id}`} className={className} title={KIND[entry.kind].text}>
         {body}
      </Link>
   ) : (
      <span className={className} title={KIND[entry.kind].text}>
         {body}
      </span>
   )
}

// One week, a row per account: what is planned, posted or drafted for each day, and which accounts have nothing. Times are in the
// viewer's zone. It shows the posts the list holds, the latest 100.
export const WeekView = ({ accounts, entries, labels }: Props) => {
   const [offset, setOffset] = useState(0)
   const [now] = useState(() => new Date())
   const start = startOfWeek(now, offset)
   const days = weekDays(start)
   const cells = byCell(entries, start)
   const rows = accounts.filter(
      ({ id, status }) => status === 'ACTIVE' || days.some((_, day) => cells.has(`${id}|${day}`))
   )
   const today = now.toDateString()

   return (
      <div className="grid gap-3">
         <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
               <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8"
                  onClick={() => setOffset(offset - 1)}
                  aria-label="Week before"
               >
                  <ChevronLeft />
               </Button>
               <Button type="button" variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(0)}>
                  This week
               </Button>
               <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8"
                  onClick={() => setOffset(offset + 1)}
                  aria-label="Week after"
               >
                  <ChevronRight />
               </Button>
            </div>
            <p className="text-muted-foreground text-xs">
               {days[0]?.toLocaleDateString(undefined, { dateStyle: 'medium' })} to{' '}
               {days[6]?.toLocaleDateString(undefined, { dateStyle: 'medium' })}. Times are in your time zone. Shows
               your latest 100 posts.
            </p>
         </div>
         <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[56rem] table-fixed border-collapse text-sm">
               <thead className="bg-muted/50">
                  <tr>
                     <th scope="col" className="w-48 p-2 text-left font-medium">
                        Account
                     </th>
                     {days.map(day => (
                        <th
                           key={day.toISOString()}
                           scope="col"
                           className={cn('p-2 text-left font-medium', day.toDateString() === today && 'text-primary')}
                        >
                           {day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                        </th>
                     ))}
                  </tr>
               </thead>
               <tbody>
                  {rows.map(account => {
                     const empty = !days.some((_, day) => cells.has(`${account.id}|${day}`))

                     return (
                        <tr key={account.id} className="border-t align-top">
                           <th scope="row" className="p-2 text-left font-normal">
                              <span className="block truncate font-medium" dir="auto">
                                 {accountName(account)}
                              </span>
                              {labels.get(account.id) ? (
                                 <Badge variant="outline">{labels.get(account.id)}</Badge>
                              ) : null}
                              {empty && readyAccounts([account]).length > 0 ? (
                                 <span className="text-muted-foreground block text-xs">Nothing this week</span>
                              ) : null}
                           </th>
                           {days.map((day, index) => (
                              <td key={day.toISOString()} className="p-1">
                                 <div className="grid gap-1">
                                    {(cells.get(`${account.id}|${index}`) ?? []).map(entry => (
                                       <Pill key={`${entry.kind}-${entry.id}`} entry={entry} />
                                    ))}
                                 </div>
                              </td>
                           ))}
                        </tr>
                     )
                  })}
               </tbody>
            </table>
         </div>
      </div>
   )
}
