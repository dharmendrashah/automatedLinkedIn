import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuSub,
   DropdownMenuSubContent,
   DropdownMenuSubTrigger,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { timeAgo } from '@/lib/time-ago'
import { MessageSquareText, MoreHorizontal, Users } from 'lucide-react'

import { cn } from '@/lib/utils'

import { staleSignal } from './message'
import {
   FITS,
   type InboxMember,
   type InboxView,
   type ListSummary,
   type MemberStatus,
   isMemberStatus,
   memberStatuses,
   reasonLine,
   workStatus,
} from './types'

import { LabelCell } from '../labels/label-cell'
import { SelectAllHead, SelectCell } from '../links/selection'
import { type Selection } from '../links/use-selection'
import { StateRows } from '../links/state-rows'

const COLUMNS = 5

type Props = {
   members: InboxMember[] | undefined
   loading: boolean
   error: string | undefined
   view: InboxView
   // People added after this were not seen by the owner yet.
   seenAt: string | null
   selection: Selection
   // The few to start with, marked on the left.
   highlight: Set<string>
   activeSlug: string | undefined
   lists: ListSummary[]
   emptyText: string
   onOpen: (member: InboxMember) => void
   onTag: (tag: string) => void
   saveTags: (member: InboxMember, tags: string[]) => Promise<unknown>
   onStatus: (member: InboxMember, status: MemberStatus) => void
   onMessage: (member: InboxMember) => void
   onMove: (member: InboxMember, list: ListSummary) => void
   onRemove: (member: InboxMember) => void
   onBlock: (member: InboxMember) => void
}

const when = (member: InboxMember, view: InboxView) =>
   member.contactedAt && (view === 'CONTACTED' || view === 'REPLIED')
      ? `Contacted ${timeAgo(member.contactedAt)}${member.status === 'CONTACTED' ? ', no reply yet' : ''}`
      : `Found ${timeAgo(member.createdAt)}`

export const InboxTable = ({
   members,
   loading,
   error,
   view,
   seenAt,
   selection,
   highlight,
   activeSlug,
   lists,
   emptyText,
   onOpen,
   onTag,
   saveTags,
   onStatus,
   onMessage,
   onMove,
   onRemove,
   onBlock,
}: Props) => {
   const ids = members?.map(({ id }) => id) ?? []

   return (
      <div className="overflow-hidden rounded-lg border">
         <Table>
            <TableHeader className="bg-muted/50">
               <TableRow>
                  <SelectAllHead ids={ids} selection={selection} noun="person" />
                  <TableHead>Person</TableHead>
                  <TableHead className="w-36">Fit</TableHead>
                  <TableHead className="w-48">Status</TableHead>
                  <TableHead className="w-40" />
               </TableRow>
            </TableHeader>
            <TableBody>
               <StateRows
                  loading={loading}
                  error={error}
                  empty={members?.length === 0}
                  columns={COLUMNS}
                  emptyIcon={Users}
                  emptyText={emptyText}
               />
               {members?.map(member => {
                  const name = member.name ?? member.slug
                  const isNew = member.status === 'NEW' && (!seenAt || member.createdAt > seenAt)
                  const others = lists.filter(list => list.id !== member.listId)
                  const reason = reasonLine(member)
                  const [top] = member.reasons

                  return (
                     <TableRow
                        key={member.id}
                        data-state={member.slug === activeSlug ? 'selected' : undefined}
                        className={cn(highlight.has(member.id) && 'border-l-primary border-l-2')}
                     >
                        <SelectCell id={member.id} name={name} selection={selection} />
                        <TableCell>
                           <div className="flex items-center gap-2">
                              {isNew ? <span className="bg-primary size-2 shrink-0 rounded-full" aria-label="New" /> : null}
                              <button
                                 type="button"
                                 className="font-medium underline-offset-4 hover:underline"
                                 onClick={() => onOpen(member)}
                              >
                                 {name}
                              </button>
                              <span className="text-muted-foreground text-xs">{member.list.name}</span>
                           </div>
                           <p className="text-muted-foreground text-xs">
                              {reason.role ? `${reason.role} · ` : null}
                              {reason.link ? (
                                 <a className="underline-offset-4 hover:underline" href={reason.link} target="_blank" rel="noreferrer noopener">
                                    {reason.signal}
                                 </a>
                              ) : (
                                 reason.signal
                              )}
                           </p>
                           {top || staleSignal(member.signals) ? (
                              <p className="text-muted-foreground text-xs">
                                 {top ? `${top.label} +${top.points}` : null}
                                 {staleSignal(member.signals) ? (
                                    <span className="text-warning">{top ? ' · ' : ''}Last signal over 30 days ago</span>
                                 ) : null}
                              </p>
                           ) : null}
                           <div className="mt-1">
                              <LabelCell
                                 tags={member.tags}
                                 kind="people"
                                 name={name}
                                 save={tags => saveTags(member, tags)}
                                 onFilter={onTag}
                              />
                           </div>
                        </TableCell>
                        <TableCell>
                           <Badge variant="outline" className={cn(FITS[member.state].className)}>
                              {FITS[member.state].label}
                              {member.score !== null ? <span className="opacity-70">{member.score}</span> : null}
                           </Badge>
                        </TableCell>
                        <TableCell>
                           <p className="text-sm">{memberStatuses[workStatus(member.status)].label}</p>
                           <p className="text-muted-foreground text-xs">{when(member, view)}</p>
                           {member.reviewAt ? <p className="text-destructive text-xs">Untouched for 6 months</p> : null}
                        </TableCell>
                        <TableCell className={cn('text-right', member.slug === activeSlug && 'bg-muted/40')}>
                           <div className="flex justify-end gap-1">
                              <Button size="sm" variant="outline" title="Copy the message and open their LinkedIn profile" onClick={() => onMessage(member)}>
                                 <MessageSquareText />
                                 Copy message
                              </Button>
                              <DropdownMenu>
                                 <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" aria-label={`More for ${name}`}>
                                       <MoreHorizontal />
                                    </Button>
                                 </DropdownMenuTrigger>
                                 <DropdownMenuContent align="end">
                                    {Object.entries(memberStatuses).map(([status, { label }]) => (
                                       <DropdownMenuItem
                                          key={status}
                                          disabled={status === workStatus(member.status)}
                                          onSelect={() => (isMemberStatus(status) ? onStatus(member, status) : undefined)}
                                       >
                                          {label}
                                       </DropdownMenuItem>
                                    ))}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuSub>
                                       <DropdownMenuSubTrigger disabled={others.length === 0}>Move to</DropdownMenuSubTrigger>
                                       <DropdownMenuSubContent>
                                          {others.map(list => (
                                             <DropdownMenuItem key={list.id} onSelect={() => onMove(member, list)}>
                                                {list.name}
                                             </DropdownMenuItem>
                                          ))}
                                       </DropdownMenuSubContent>
                                    </DropdownMenuSub>
                                    <DropdownMenuItem onSelect={() => onRemove(member)}>Remove</DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem variant="destructive" onSelect={() => onBlock(member)}>
                                       Do not contact
                                    </DropdownMenuItem>
                                 </DropdownMenuContent>
                              </DropdownMenu>
                           </div>
                        </TableCell>
                     </TableRow>
                  )
               })}
            </TableBody>
         </Table>
      </div>
   )
}
