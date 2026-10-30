import { Photo } from '@/components/photo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { timeAgo } from '@/lib/time-ago'
import { IconBrandLinkedin } from '@tabler/icons-react'
import { useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

import { type Client, type PersonRow } from './types'

import { type NextStep, PRIORITY, nextStepOf } from './rows'
import { FIT_WORDS, nameOf, statusWord } from './words'

type Props = {
   rows: PersonRow[]
   accounts: Client['accounts']
   // Accounts whose invites are stopped (signed out, restricted, LinkedIn's limit): their chips show red.
   stopped: string[]
   invitesLive: boolean
   selectedId: string | null
   chosen: string[]
   onOpen: (id: string) => void
   onChoose: (id: string) => void
   onChooseAll: () => void
   onStep: (row: PersonRow, step: NonNullable<NextStep>) => void
}

const initials = (name: string) =>
   name
      .split(/\s+/)
      .slice(0, 2)
      .map(word => word[0] ?? '')
      .join('')
      .toUpperCase()

const Dot = ({ className, label }: { className: string; label: string }) => (
   <span className={cn('inline-block size-2 shrink-0 rounded-full', className)} role="img" aria-label={label} />
)

const Reason = ({ row }: { row: PersonRow }) =>
   row.reasonText ? (
      <span className="line-clamp-2">
         {row.reasonUrl ? (
            <a
               href={row.reasonUrl}
               target="_blank"
               rel="noopener noreferrer"
               className="underline-offset-4 hover:underline"
               onClick={event => event.stopPropagation()}
            >
               {row.reasonText}
            </a>
         ) : (
            row.reasonText
         )}
         {row.reasonAt ? <span className="text-muted-foreground"> · {timeAgo(row.reasonAt)}</span> : null}
      </span>
   ) : null

const STEP_WORDS: Record<NonNullable<NextStep>['kind'], string> = {
   REPLY: 'Reply',
   ACCEPT: 'Accept',
   INVITE: 'Invite',
}

const AccountChips = ({
   row,
   accounts,
   stopped,
}: {
   row: PersonRow
   accounts: Client['accounts']
   stopped: string[]
}) => {
   const ids = [...new Set(row.links.flatMap(({ accountId }) => (accountId ? [accountId] : [])))]

   return (
      <span className="flex flex-wrap gap-1">
         {ids.map(id => {
            const account = accounts.find(other => other.id === id)

            return account ? (
               <Badge
                  key={id}
                  variant={stopped.includes(id) ? 'destructive' : 'outline'}
                  className="max-w-32 truncate"
                  title={stopped.includes(id) ? 'Invites from this account are stopped' : undefined}
               >
                  {account.displayName ?? account.email}
               </Badge>
            ) : null
         })}
      </span>
   )
}

// One row per person of the client: who, why, fit, last touch, status and the one next step.
export const PeopleTable = ({
   rows,
   accounts,
   stopped,
   invitesLive,
   selectedId,
   chosen,
   onOpen,
   onChoose,
   onChooseAll,
   onStep,
}: Props) => {
   const many = accounts.length > 1
   const selected = useRef<HTMLTableRowElement>(null)

   useEffect(() => selected.current?.scrollIntoView({ block: 'nearest' }), [selectedId])

   return (
      <Table>
         <TableHeader className="bg-muted/50">
            <TableRow>
               <TableHead className="w-10">
                  <Checkbox
                     aria-label="Choose every person on this page"
                     checked={chosen.length > 0 && chosen.length >= Math.min(rows.length, 100)}
                     onCheckedChange={onChooseAll}
                  />
               </TableHead>
               <TableHead>Person</TableHead>
               <TableHead>Reason</TableHead>
               <TableHead>Fit</TableHead>
               <TableHead>Last touch</TableHead>
               <TableHead>Status</TableHead>
               {many ? <TableHead>Accounts</TableHead> : null}
               <TableHead className="text-right">Next step</TableHead>
            </TableRow>
         </TableHeader>
         <TableBody>
            {rows.map(row => {
               const step = nextStepOf({
                  ...row,
                  invitesLive,
               })
               const isSelected = row.id === selectedId
               const name = nameOf(row)

               return (
                  <TableRow
                     key={row.id}
                     ref={isSelected ? selected : undefined}
                     data-state={isSelected ? 'selected' : undefined}
                     className="cursor-pointer"
                     onClick={() => onOpen(row.id)}
                  >
                     <TableCell onClick={event => event.stopPropagation()}>
                        <Checkbox
                           aria-label={`Choose ${name}`}
                           checked={chosen.includes(row.id)}
                           onCheckedChange={() => onChoose(row.id)}
                        />
                     </TableCell>
                     <TableCell className="max-w-80">
                        <div className="flex items-center gap-3">
                           <span className="bg-muted relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full text-xs font-medium">
                              {initials(name)}
                              <Photo url={row.photoUrl ?? undefined} />
                           </span>
                           <div className="grid min-w-0">
                              <span className="flex items-center gap-1.5 font-medium">
                                 {row.isNew ? <Dot className="bg-primary" label="New since your last visit" /> : null}
                                 <span className="truncate">{name}</span>
                                 <a
                                    href={`https://www.linkedin.com/in/${encodeURIComponent(row.slug)}/`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`${name} on LinkedIn`}
                                    className="text-muted-foreground hover:text-foreground shrink-0"
                                    onClick={event => event.stopPropagation()}
                                 >
                                    <IconBrandLinkedin className="size-4" />
                                 </a>
                              </span>
                              {row.headline ? (
                                 <span className="text-muted-foreground truncate text-xs">{row.headline}</span>
                              ) : null}
                           </div>
                        </div>
                     </TableCell>
                     <TableCell className="max-w-96 text-sm whitespace-normal">
                        <Reason row={row} />
                     </TableCell>
                     <TableCell className="text-sm">{row.fit === 'NONE' ? '' : FIT_WORDS[row.fit]}</TableCell>
                     <TableCell className="text-sm">
                        <span className="flex items-center gap-1.5">
                           {row.priority === PRIORITY.REPLY ? (
                              <Dot className="bg-destructive" label="Unread reply" />
                           ) : null}
                           {timeAgo(row.lastTouchAt)}
                        </span>
                     </TableCell>
                     <TableCell className="text-sm">{statusWord(row.status)}</TableCell>
                     {many ? (
                        <TableCell>
                           <AccountChips row={row} accounts={accounts} stopped={stopped} />
                        </TableCell>
                     ) : null}
                     <TableCell className="text-right" onClick={event => event.stopPropagation()}>
                        {step ? (
                           <Button
                              size="sm"
                              variant={step.kind === 'REPLY' ? 'default' : 'outline'}
                              onClick={() => onStep(row, step)}
                           >
                              {STEP_WORDS[step.kind]}
                           </Button>
                        ) : null}
                     </TableCell>
                  </TableRow>
               )
            })}
         </TableBody>
      </Table>
   )
}
