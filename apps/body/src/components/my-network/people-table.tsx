import premiumMark from '@/assets/linkedin-premium.png'
import { LabelCell } from '@/components/labels/label-cell'
import { Photo } from '@/components/photo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { flagOf } from '@/lib/country-flag'
import { timeAgo } from '@/lib/time-ago'
import { IconBrandLinkedin } from '@tabler/icons-react'
import {
   FlexRender,
   type SortingState,
   type Updater,
   createColumnHelper,
   rowSortingFeature,
   tableFeatures,
   useTable,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'

import { cn } from '@/lib/utils'

import { type Client, type PersonRow } from './types'

import { type RouterInputs } from '../../trpc'
import { RowActions } from './row-actions-cell'
import { type NextStep, PRIORITY, nextStepOf } from './rows'
import { nameOf, statusWord } from './words'

export type PeopleSort = NonNullable<RouterInputs['people']['list']['sort']>

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
   onInvite: (row: PersonRow) => void
   onReadProfile: (row: PersonRow) => void
   // Saves the row's full label list.
   onLabels: (row: PersonRow, labels: string[]) => Promise<unknown>
   sort: PeopleSort | undefined
   onSort: (sort: PeopleSort | undefined) => void
   // More rows wait in brain; asked for when the owner scrolls near the end.
   hasMore: boolean
   loadingMore: boolean
   onMore: () => void
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

// Only the visible rows are drawn (TanStack Virtual), so thousands of people scroll smoothly; brain sorts and pages them.
const features = tableFeatures({ rowSortingFeature })
const column = createColumnHelper<typeof features, PersonRow>()
const SORTS: Array<PeopleSort['by']> = ['name', 'lastTouchAt']
const ROW_HEIGHT = 57
// Ask for the next page this many rows before the end.
const LOAD_AHEAD = 15

const CELL_CLASS: Record<string, string> = {
   choose: 'w-10',
   name: 'max-w-80',
   reason: 'max-w-96 text-sm whitespace-normal',
   labels: 'max-w-56',
   lastTouchAt: 'text-sm',
   status: 'text-sm',
   step: 'text-right',
   actions: 'w-0 text-right',
}

const SortHeader = ({
   label,
   sorted,
   onClick,
}: {
   label: string
   sorted: false | 'asc' | 'desc'
   onClick?: (event: unknown) => void
}) => {
   const Arrow = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown

   return (
      <button
         type="button"
         className="hover:text-foreground -ml-1 inline-flex items-center gap-1 rounded px-1"
         aria-label={`Sort by ${label.toLowerCase()}`}
         onClick={onClick}
      >
         {label}
         <Arrow className={cn('size-3.5', !sorted && 'opacity-40')} />
      </button>
   )
}

const PersonCell = ({ row }: { row: PersonRow }) => {
   const name = nameOf(row)
   const flag = flagOf(row.country)

   return (
      <div className="flex items-center gap-3">
         <span className="bg-muted relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full text-xs font-medium">
            {initials(name)}
            <Photo url={row.photoUrl ?? undefined} />
         </span>
         <div className="grid min-w-0">
            {row.company ? <span className="text-muted-foreground truncate text-xs">{row.company}</span> : null}
            <span className="flex items-center gap-1.5 font-medium">
               {row.isNew ? <Dot className="bg-primary" label="New since your last visit" /> : null}
               <span className="truncate">{name}</span>
               <a
                  href={`https://www.linkedin.com/in/${encodeURIComponent(row.slug)}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={row.premium ? `${name} on LinkedIn, Premium` : `${name} on LinkedIn`}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  onClick={event => event.stopPropagation()}
               >
                  {row.premium ? (
                     <img src={premiumMark} alt="" className="size-4 rounded-[3px]" />
                  ) : (
                     <IconBrandLinkedin className="size-4" />
                  )}
               </a>
               {flag && row.country ? (
                  <span role="img" aria-label={row.country} title={row.country}>
                     {flag}
                  </span>
               ) : null}
            </span>
            {row.headline ? <span className="text-muted-foreground truncate text-xs">{row.headline}</span> : null}
         </div>
      </div>
   )
}

type ColumnsOf = Pick<
   Props,
   | 'accounts'
   | 'stopped'
   | 'invitesLive'
   | 'chosen'
   | 'rows'
   | 'onOpen'
   | 'onChoose'
   | 'onChooseAll'
   | 'onStep'
   | 'onInvite'
   | 'onReadProfile'
   | 'onLabels'
> & {
   many: boolean
}

const columnsOf = ({
   accounts,
   stopped,
   invitesLive,
   many,
   chosen,
   rows,
   onOpen,
   onChoose,
   onChooseAll,
   onStep,
   onInvite,
   onReadProfile,
   onLabels,
}: ColumnsOf) =>
   column.columns([
      column.display({
         id: 'choose',
         header: () => (
            <Checkbox
               aria-label="Choose every person on this page"
               checked={chosen.length > 0 && chosen.length >= Math.min(rows.length, 100)}
               onCheckedChange={onChooseAll}
            />
         ),
         cell: ({ row }) => (
            <span onClick={event => event.stopPropagation()}>
               <Checkbox
                  aria-label={`Choose ${nameOf(row.original)}`}
                  checked={chosen.includes(row.original.id)}
                  onCheckedChange={() => onChoose(row.original.id)}
               />
            </span>
         ),
      }),
      column.accessor('name', {
         header: ({ column: header }) => (
            <SortHeader label="Person" sorted={header.getIsSorted()} onClick={header.getToggleSortingHandler()} />
         ),
         cell: ({ row }) => <PersonCell row={row.original} />,
      }),
      column.display({
         id: 'reason',
         header: 'Reason',
         cell: ({ row }) => <Reason row={row.original} />,
      }),
      column.accessor('labels', {
         header: 'Labels',
         enableSorting: false,
         cell: ({ row }) => (
            <span onClick={event => event.stopPropagation()}>
               <LabelCell
                  tags={row.original.labels}
                  kind="people"
                  name={nameOf(row.original)}
                  save={labels => onLabels(row.original, labels)}
               />
            </span>
         ),
      }),
      column.accessor('lastTouchAt', {
         header: ({ column: header }) => (
            <SortHeader label="Last touch" sorted={header.getIsSorted()} onClick={header.getToggleSortingHandler()} />
         ),
         sortDescFirst: true,
         cell: ({ row }) => (
            <span className="flex items-center gap-1.5">
               {row.original.priority === PRIORITY.REPLY ? (
                  <Dot className="bg-destructive" label="Unread reply" />
               ) : null}
               {timeAgo(row.original.lastTouchAt)}
            </span>
         ),
      }),
      column.accessor('status', {
         header: 'Status',
         enableSorting: false,
         cell: ({ row }) => statusWord(row.original.status),
      }),
      ...(many
         ? [
              column.display({
                 id: 'accounts',
                 header: 'Accounts',
                 cell: ({ row }) => <AccountChips row={row.original} accounts={accounts} stopped={stopped} />,
              }),
           ]
         : []),
      column.display({
         id: 'step',
         header: 'Suggested next step',
         cell: ({ row }) => {
            const step = nextStepOf({
               ...row.original,
               invitesLive,
            })

            return step ? (
               <span onClick={event => event.stopPropagation()}>
                  <Button
                     size="sm"
                     variant={step.kind === 'REPLY' ? 'default' : 'outline'}
                     onClick={() => onStep(row.original, step)}
                  >
                     {STEP_WORDS[step.kind]}
                  </Button>
               </span>
            ) : null
         },
      }),
      column.display({
         id: 'actions',
         header: () => <span className="sr-only">Actions</span>,
         cell: ({ row }) => (
            <RowActions
               row={row.original}
               invitesLive={invitesLive}
               onInvite={onInvite}
               onReadProfile={onReadProfile}
               onPreview={person => onOpen(person.id)}
            />
         ),
      }),
   ])

// One row per person of the client: who, why, labels, last touch, status, the suggested next step and the row's actions.
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
   onInvite,
   onReadProfile,
   onLabels,
   sort,
   onSort,
   hasMore,
   loadingMore,
   onMore,
}: Props) => {
   const many = accounts.length > 1
   const scroller = useRef<HTMLDivElement>(null)
   const sorting: SortingState = sort
      ? [
           {
              id: sort.by,
              desc: sort.desc,
           },
        ]
      : []
   const columns = useMemo(
      () =>
         columnsOf({
            accounts,
            stopped,
            invitesLive,
            many,
            chosen,
            rows,
            onOpen,
            onChoose,
            onChooseAll,
            onStep,
            onInvite,
            onReadProfile,
            onLabels,
         }),
      [
         accounts,
         stopped,
         invitesLive,
         many,
         chosen,
         rows,
         onOpen,
         onChoose,
         onChooseAll,
         onStep,
         onInvite,
         onReadProfile,
         onLabels,
      ]
   )
   const table = useTable({
      features,
      data: rows,
      columns,
      getRowId: row => row.id,
      state: { sorting },
      manualSorting: true,
      enableSortingRemoval: true,
      onSortingChange: (updater: Updater<SortingState>) => {
         const [next] = typeof updater === 'function' ? updater(sorting) : updater
         const by = SORTS.find(item => item === next?.id)

         onSort(
            next && by
               ? {
                    by,
                    desc: next.desc,
                 }
               : undefined
         )
      },
   })
   // oxlint-disable-next-line react/incompatible-library -- the virtualizer's functions are used here and as the rows' ref, never memoised
   const virtualizer = useVirtualizer({
      count: rows.length,
      getScrollElement: () => scroller.current,
      estimateSize: () => ROW_HEIGHT,
      overscan: 12,
   })
   const items = virtualizer.getVirtualItems()
   const last = items.at(-1)?.index ?? -1
   const top = items[0]?.start ?? 0
   const bottom = virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0)
   const selectedIndex = rows.findIndex(row => row.id === selectedId)
   const width = table.getAllLeafColumns().length

   useEffect(() => {
      if (hasMore && !loadingMore && last >= rows.length - LOAD_AHEAD) {
         onMore()
      }
   }, [hasMore, loadingMore, last, rows.length, onMore])

   useEffect(() => {
      if (selectedIndex >= 0) {
         virtualizer.scrollToIndex(selectedIndex, { align: 'auto' })
      }
   }, [selectedIndex, virtualizer])

   return (
      <div ref={scroller} className="relative max-h-[calc(100svh-14rem)] min-h-64 overflow-auto">
         <table className="w-full caption-bottom text-sm">
            <TableHeader className="bg-muted sticky top-0 z-10">
               {table.getHeaderGroups().map(group => (
                  <TableRow key={group.id}>
                     {group.headers.map(header => (
                        <TableHead key={header.id} className={CELL_CLASS[header.column.id]}>
                           {header.isPlaceholder ? null : <FlexRender header={header} />}
                        </TableHead>
                     ))}
                  </TableRow>
               ))}
            </TableHeader>
            <TableBody>
               {top > 0 ? (
                  <tr aria-hidden style={{ height: top }}>
                     <td colSpan={width} />
                  </tr>
               ) : null}
               {items.map(item => {
                  const row = table.getRowModel().rows[item.index]

                  if (!row) {
                     return null
                  }

                  return (
                     <TableRow
                        key={row.id}
                        data-index={item.index}
                        ref={virtualizer.measureElement}
                        data-state={row.id === selectedId ? 'selected' : undefined}
                        className="group/row cursor-pointer"
                        onClick={() => onOpen(row.id)}
                     >
                        {row.getAllCells().map(cell => (
                           <TableCell key={cell.id} className={CELL_CLASS[cell.column.id]}>
                              <FlexRender cell={cell} />
                           </TableCell>
                        ))}
                     </TableRow>
                  )
               })}
               {bottom > 0 ? (
                  <tr aria-hidden style={{ height: bottom }}>
                     <td colSpan={width} />
                  </tr>
               ) : null}
               {loadingMore ? (
                  <tr>
                     <td colSpan={width} className="text-muted-foreground p-3 text-center text-sm">
                        <Loader2 className="mr-2 inline size-4 animate-spin" />
                        Loading more people…
                     </td>
                  </tr>
               ) : null}
            </TableBody>
         </table>
      </div>
   )
}
