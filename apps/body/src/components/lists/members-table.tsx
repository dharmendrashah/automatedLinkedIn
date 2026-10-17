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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, MoreHorizontal, Users } from 'lucide-react'

import {
   type ListSummary,
   type Member,
   type MemberState,
   type MemberStatus,
   isMemberStatus,
   memberStates,
   memberStatuses,
} from './types'

import { StateRows } from '../links/state-rows'

const COLUMNS = 5

const formatDate = (value: string) => new Date(value).toLocaleDateString()

const details = ({ headline, location }: Member) => [headline, location].filter(Boolean).join(' · ')

type Props = {
   members: Member[] | undefined
   loading: boolean
   error: string | undefined
   busyId: string | undefined
   // The owner's other lists, to move a person to.
   otherLists: ListSummary[]
   onStatus: (member: Member, status: MemberStatus) => void
   onState: (member: Member, state: MemberState) => void
   onMove: (member: Member, list: ListSummary) => void
   onDoNotContact: (member: Member) => void
   onDelete: (member: Member) => void
}

export const MembersTable = ({
   members,
   loading,
   error,
   busyId,
   otherLists,
   onStatus,
   onState,
   onMove,
   onDoNotContact,
   onDelete,
}: Props) => (
   <div className="overflow-hidden rounded-lg border">
      <Table>
         <TableHeader className="bg-muted/50">
            <TableRow>
               <TableHead>Person</TableHead>
               <TableHead>Found via</TableHead>
               <TableHead>Found</TableHead>
               <TableHead className="w-40">Status</TableHead>
               <TableHead className="w-16" />
            </TableRow>
         </TableHeader>
         <TableBody>
            <StateRows
               loading={loading}
               error={error}
               empty={members?.length === 0}
               columns={COLUMNS}
               emptyIcon={Users}
               emptyText="Nobody here yet. Use Add person, or let a workflow fill this list."
            />
            {members?.map(member => {
               const name = member.name ?? member.slug
               const otherState: MemberState = member.state === 'QUALIFIED' ? 'MAYBE' : 'QUALIFIED'

               return (
                  <TableRow key={member.id}>
                     <TableCell>
                        <a
                           className="font-medium underline-offset-4 hover:underline"
                           href={member.url}
                           target="_blank"
                           rel="noreferrer noopener"
                        >
                           {name}
                        </a>
                        {details(member) ? <p className="text-muted-foreground text-xs">{details(member)}</p> : null}
                     </TableCell>
                     <TableCell>
                        {member.postUrl ? (
                           <a
                              className="underline-offset-4 hover:underline"
                              href={member.postUrl}
                              target="_blank"
                              rel="noreferrer noopener"
                           >
                              A post they engaged with
                           </a>
                        ) : (
                           <span className="text-muted-foreground">Added by hand</span>
                        )}
                     </TableCell>
                     <TableCell className="text-muted-foreground">{formatDate(member.createdAt)}</TableCell>
                     <TableCell>
                        <Select
                           value={member.status}
                           onValueChange={next => (isMemberStatus(next) ? onStatus(member, next) : undefined)}
                        >
                           <SelectTrigger className="w-36" aria-label={`Status of ${name}`}>
                              <SelectValue />
                           </SelectTrigger>
                           <SelectContent>
                              {Object.entries(memberStatuses).map(([value, { label }]) => (
                                 <SelectItem key={value} value={value}>
                                    {label}
                                 </SelectItem>
                              ))}
                           </SelectContent>
                        </Select>
                     </TableCell>
                     <TableCell>
                        <DropdownMenu>
                           <DropdownMenuTrigger asChild>
                              <Button
                                 variant="ghost"
                                 size="icon"
                                 disabled={busyId === member.id}
                                 aria-label={`Actions for ${name}`}
                              >
                                 {busyId === member.id ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
                              </Button>
                           </DropdownMenuTrigger>
                           <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => onState(member, otherState)}>
                                 Mark as {memberStates[otherState].label}
                              </DropdownMenuItem>
                              <DropdownMenuSub>
                                 <DropdownMenuSubTrigger disabled={otherLists.length === 0}>
                                    Move to
                                 </DropdownMenuSubTrigger>
                                 <DropdownMenuSubContent>
                                    {otherLists.map(list => (
                                       <DropdownMenuItem key={list.id} onSelect={() => onMove(member, list)}>
                                          {list.name}
                                       </DropdownMenuItem>
                                    ))}
                                 </DropdownMenuSubContent>
                              </DropdownMenuSub>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => onDoNotContact(member)}>Do not contact</DropdownMenuItem>
                              <DropdownMenuItem variant="destructive" onSelect={() => onDelete(member)}>
                                 Delete
                              </DropdownMenuItem>
                           </DropdownMenuContent>
                        </DropdownMenu>
                     </TableCell>
                  </TableRow>
               )
            })}
         </TableBody>
      </Table>
   </div>
)
