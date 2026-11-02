import { Photo } from '@/components/photo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, MoreHorizontal, PanelRightOpen, Pause, Play, UserRound } from 'lucide-react'
import { Link } from 'react-router'

import { type Account } from './types'

import { BrowsingMeter } from './browsing-meter'
import { type ColumnId } from './columns'
import { GettingReady } from './getting-ready'
import { StatusBadge } from './status-badge'
import { TodayCell } from './today-cell'
import { type Row } from './toolbar'
import { hoursNowText, whyText } from './verdict'
import { VisitSummary } from './visit-summary'

const formatDate = (value: string | Date | null) => (value ? new Date(value).toLocaleDateString() : '—')

const initialsOf = (name: string) =>
   name
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join('')

// A click on these opens nothing: they do their own job.
const OWN_CLICK = 'button, a, input, [role="checkbox"], [role="menuitem"]'

type Props = {
   rows: Row<Account>[]
   columns: ColumnId[]
   // Full chips with times in the Today cell, instead of the compact line.
   detailed: boolean
   // The day of the accounts is still being read.
   todayLoading: boolean
   selectable: boolean
   selected: Set<string>
   loading: boolean
   busy: (id: string) => boolean
   onSelect: (ids: string[], on: boolean) => void
   onOpen: (id: string) => void
   onPause: (account: Account) => void
   onResume: (account: Account) => void
}

type RowProps = Pick<
   Props,
   | 'columns'
   | 'detailed'
   | 'todayLoading'
   | 'selectable'
   | 'selected'
   | 'busy'
   | 'onSelect'
   | 'onOpen'
   | 'onPause'
   | 'onResume'
> & {
   row: Row<Account>
}

const AccountRow = ({
   row,
   columns,
   detailed,
   todayLoading,
   selectable,
   selected,
   busy,
   onSelect,
   onOpen,
   onPause,
   onResume,
}: RowProps) => {
   const { account, browse, verdict, states } = row
   const paused = account.status === 'DISABLED'

   return (
      <TableRow
         className="hover:bg-muted/40 cursor-pointer"
         data-state={selected.has(account.id) ? 'selected' : undefined}
         onClick={event => {
            if (!(event.target instanceof Element && event.target.closest(OWN_CLICK))) {
               onOpen(account.id)
            }
         }}
      >
         {selectable ? (
            <TableCell className="w-8">
               <Checkbox
                  checked={selected.has(account.id)}
                  aria-label={`Select ${account.email}`}
                  onCheckedChange={value => onSelect([account.id], value === true)}
               />
            </TableCell>
         ) : null}
         <TableCell className="align-top font-medium">
            <div className="flex items-start gap-2">
               {account.displayName ? (
                  <span className="bg-muted text-muted-foreground relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-full text-xs font-semibold">
                     {initialsOf(account.displayName)}
                     <Photo url={account.imageUrl ?? undefined} />
                  </span>
               ) : null}
               <div className="grid min-w-0 gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                     <button
                        type="button"
                        className="focus-visible:ring-ring/50 rounded-sm text-left underline-offset-4 outline-none hover:underline focus-visible:ring-[3px]"
                        aria-label={`Open details of ${account.email}`}
                        onClick={() => onOpen(account.id)}
                     >
                        {account.displayName ?? account.email}
                     </button>
                  </div>
                  {account.displayName ? (
                     <span className="text-muted-foreground text-xs font-normal">{account.email}</span>
                  ) : null}
               </div>
            </div>
            <Link
               to={`/accounts/${account.id}`}
               className="text-muted-foreground mt-1 inline-flex items-center gap-1 text-xs font-normal underline-offset-4 hover:underline"
            >
               <UserRound className="size-3" aria-hidden />
               Profile
            </Link>
            {account.loading ? (
               <div className="mt-2 font-normal">
                  <GettingReady loading={account.loading} status={account.status} />
               </div>
            ) : null}
         </TableCell>
         <TableCell className="align-top">
            <div className="grid max-w-64 gap-1">
               <span>
                  <StatusBadge status={account.status} message={account.statusMessage} />
               </span>
               <span className="text-muted-foreground text-xs">{whyText(account, browse)}</span>
               {verdict === 'NEEDS_YOU' ? (
                  <Button variant="outline" size="sm" className="h-7 w-fit" onClick={() => onOpen(account.id)}>
                     Fix
                  </Button>
               ) : null}
               {account.lastVerifiedAt ? (
                  <span className="text-muted-foreground text-xs">Checked {formatDate(account.lastVerifiedAt)}</span>
               ) : null}
            </div>
         </TableCell>
         <TableCell className="align-top">
            <TodayCell
               states={states}
               browse={browse}
               detailed={detailed}
               loading={todayLoading}
               onOpen={() => onOpen(account.id)}
            />
         </TableCell>
         {columns.includes('browsing') ? (
            <TableCell className="align-top">
               <BrowsingMeter browse={browse} />
            </TableCell>
         ) : null}
         {columns.includes('visit') ? (
            <TableCell className="align-top">
               <VisitSummary account={account} />
            </TableCell>
         ) : null}
         {columns.includes('verified') ? (
            <TableCell className="text-muted-foreground align-top">{formatDate(account.lastVerifiedAt)}</TableCell>
         ) : null}
         {columns.includes('added') ? (
            <TableCell className="text-muted-foreground align-top">{formatDate(account.createdAt)}</TableCell>
         ) : null}
         {columns.includes('credentials') ? (
            <TableCell className="align-top">
               <span className="flex flex-wrap gap-1">
                  {account.hasPassword ? <Badge variant="secondary">Password</Badge> : null}
                  {account.hasTotp ? <Badge variant="secondary">Two-step key</Badge> : null}
                  {account.hasSession ? <Badge variant="secondary">Browser token</Badge> : null}
               </span>
            </TableCell>
         ) : null}
         {columns.includes('hours') ? (
            <TableCell className="text-muted-foreground align-top">{hoursNowText(browse)}</TableCell>
         ) : null}
         <TableCell className="w-12 align-top">
            <DropdownMenu>
               <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={`Actions for ${account.email}`}>
                     {busy(account.id) ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
                  </Button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => onOpen(account.id)}>
                     <PanelRightOpen />
                     Open details
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                     <Link to={`/accounts/${account.id}`}>
                        <UserRound />
                        View profile
                     </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => (paused ? onResume(account) : onPause(account))}>
                     {paused ? <Play /> : <Pause />}
                     {paused ? 'Resume' : 'Pause'}
                  </DropdownMenuItem>
               </DropdownMenuContent>
            </DropdownMenu>
         </TableCell>
      </TableRow>
   )
}

// Every account in one list, worst first: the account, why it is in its state, today's browsing and the daily visit, with the optional
// columns the owner picked. A row opens the account's drawer.
export const AccountList = ({
   rows,
   columns,
   detailed,
   todayLoading,
   selectable,
   selected,
   loading,
   busy,
   onSelect,
   onOpen,
   onPause,
   onResume,
}: Props) => {
   const span = 4 + columns.filter(id => id !== 'detail').length + (selectable ? 1 : 0)
   const ids = rows.map(({ account }) => account.id)
   const allSelected = ids.length > 0 && ids.every(id => selected.has(id))
   const someSelected = ids.some(id => selected.has(id))
   const rowProps = { columns, detailed, todayLoading, selectable, selected, busy, onSelect, onOpen, onPause, onResume }

   return (
      <div className="overflow-x-auto rounded-lg border">
         <Table>
            <TableHeader className="bg-muted/50">
               <TableRow>
                  {selectable ? (
                     <TableHead className="w-8">
                        <Checkbox
                           checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                           aria-label="Select every account shown"
                           onCheckedChange={value => onSelect(ids, value === true)}
                        />
                     </TableHead>
                  ) : null}
                  <TableHead>Account</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Today</TableHead>
                  {columns.includes('browsing') ? <TableHead>Browsing today</TableHead> : null}
                  {columns.includes('visit') ? <TableHead>Daily visit</TableHead> : null}
                  {columns.includes('verified') ? <TableHead>Last verified</TableHead> : null}
                  {columns.includes('added') ? <TableHead>Added</TableHead> : null}
                  {columns.includes('credentials') ? <TableHead>Credentials</TableHead> : null}
                  {columns.includes('hours') ? <TableHead>Working hours now</TableHead> : null}
                  <TableHead className="w-12">
                     <span className="sr-only">Actions</span>
                  </TableHead>
               </TableRow>
            </TableHeader>
            <TableBody>
               {loading ? (
                  <TableRow>
                     <TableCell colSpan={span}>
                        <Skeleton className="h-8 w-full" />
                     </TableCell>
                  </TableRow>
               ) : null}
               {rows.map(row => (
                  <AccountRow key={row.account.id} row={row} {...rowProps} />
               ))}
            </TableBody>
         </Table>
      </div>
   )
}
