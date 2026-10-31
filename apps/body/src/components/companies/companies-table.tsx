import { Picture } from '@/components/details/detail-parts'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { flagOf } from '@/lib/country-flag'
import { timeAgo } from '@/lib/time-ago'
import { useFillHeight } from '@/lib/use-fill-height'
import {
   FlexRender,
   type SortingState,
   type Updater,
   columnVisibilityFeature,
   createColumnHelper,
   rowSortingFeature,
   tableFeatures,
   useTable,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Building2, Loader2 } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef } from 'react'

import { cn } from '@/lib/utils'

import { type Company } from './types'

import { LabelCell } from '../labels/label-cell'
import { LinkStatusBadge } from '../links/link-status-badge'
import { type Selection } from '../links/use-selection'
import { visitedText } from '../links/visit-form'
import { SortHeader } from '../table/sort-header'
import { type HiddenColumns } from '../table/use-hidden-columns'
import { ContactAvatar } from '../unibox/account-avatar'
import { PersonCard } from '../unibox/person-card'
import { domainOf } from './company/facts'
import { type CompanySort } from './use-companies'

const SORTS: Array<CompanySort['by']> = ['createdAt', 'name']
const ROW_HEIGHT = 61
const LOAD_AHEAD = 15

const CELL_CLASS: Record<string, string> = {
   select: 'w-0',
   name: 'min-w-64 max-w-96',
   industry: 'max-w-48',
   country: 'whitespace-nowrap',
   size: 'whitespace-nowrap',
   followers: 'text-right tabular-nums whitespace-nowrap',
   website: 'max-w-48',
   people: 'whitespace-nowrap',
   status: 'w-0',
   labels: 'min-w-40',
   createdAt: 'whitespace-nowrap text-muted-foreground',
   readAt: 'max-w-44',
}

const features = tableFeatures({
   rowSortingFeature,
   columnVisibilityFeature,
})
const column = createColumnHelper<typeof features, Company>()

const nameOf = (company: Company) => company.name ?? company.slug

const Muted = ({ children }: { children: ReactNode }) => <span className="text-muted-foreground">{children}</span>

// Clicks inside stay there and do not open the row.
const Stop = ({ children }: { children: ReactNode }) => (
   // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- only stops the row's click
   <span className="contents" onClick={event => event.stopPropagation()}>
      {children}
   </span>
)

const CompanyCell = ({ company }: { company: Company }) => (
   <div className="flex min-w-0 items-center gap-3">
      <Picture
         name={nameOf(company)}
         image={company.card?.logo ?? null}
         square
         className="size-10 shrink-0 rounded-md border text-xs"
      />
      <div className="grid min-w-0">
         <span className="truncate font-medium">{nameOf(company)}</span>
         <span className="text-muted-foreground truncate text-xs" title={company.card?.tagline ?? undefined}>
            {company.card?.tagline ?? company.slug}
         </span>
      </div>
   </div>
)

type Handlers = {
   selection: Selection
   onTag: (tag: string) => void
   saveTags: (company: Company, tags: string[]) => Promise<unknown>
   onPerson: (slug: string) => void
}

// The company's My network people: up to three photos with a short look on hover, how many work there and how many did.
const PeopleCell = ({ people, onPerson }: { people: Company['people']; onPerson: (slug: string) => void }) =>
   people.count + people.former === 0 ? (
      <Muted>—</Muted>
   ) : (
      <Stop>
         <span className="flex items-center gap-2">
            <span className="flex -space-x-2">
               {people.first.map(person => (
                  <PersonCard key={person.slug} slug={person.slug} onOpen={onPerson}>
                     <ContactAvatar
                        name={person.name ?? person.slug}
                        size="sm"
                        className={cn('ring-background ring-2', person.relation === 'FORMER' && 'opacity-50 grayscale')}
                        {...(person.photoUrl && { imageUrl: person.photoUrl })}
                     />
                  </PersonCard>
               ))}
            </span>
            <span className="grid text-sm leading-tight tabular-nums">
               {people.count > 0 ? people.count : null}
               {people.former > 0 ? (
                  <span className="text-muted-foreground text-xs">{people.former} former</span>
               ) : null}
            </span>
         </span>
      </Stop>
   )

const columnsOf = (ids: string[], handlers: Handlers) =>
   column.columns([
      column.display({
         id: 'select',
         header: () => (
            <Checkbox
               aria-label="Select every company shown"
               checked={ids.length > 0 && ids.every(id => handlers.selection.selected.has(id))}
               onCheckedChange={checked => handlers.selection.select(ids, checked === true)}
            />
         ),
         cell: ({ row }) => (
            <Stop>
               <Checkbox
                  aria-label={`Select ${nameOf(row.original)}`}
                  checked={handlers.selection.selected.has(row.original.id)}
                  onCheckedChange={checked => handlers.selection.select([row.original.id], checked === true)}
               />
            </Stop>
         ),
      }),
      column.accessor('name', {
         header: ({ column: header }) => (
            <SortHeader label="Company" sorted={header.getIsSorted()} onClick={header.getToggleSortingHandler()} />
         ),
         cell: ({ row }) => <CompanyCell company={row.original} />,
      }),
      column.display({
         id: 'industry',
         header: 'Industry',
         cell: ({ row }) =>
            row.original.industry ? (
               <span className="line-clamp-2" title={row.original.industry}>
                  {row.original.industry}
               </span>
            ) : (
               <Muted>—</Muted>
            ),
      }),
      column.display({
         id: 'country',
         header: 'Country',
         cell: ({ row }) => {
            const { country, location } = row.original

            return country ? (
               <span title={location ?? undefined}>
                  {flagOf(country) ? `${flagOf(country)} ` : ''}
                  {country}
               </span>
            ) : (
               <Muted>{location ?? '—'}</Muted>
            )
         },
      }),
      column.display({
         id: 'size',
         header: 'Size',
         cell: ({ row }) => {
            const employees = row.original.card?.employees

            return (
               <span className="grid">
                  {row.original.size ? `${row.original.size.replace('-', '–')} employees` : <Muted>—</Muted>}
                  {employees ? (
                     <span className="text-muted-foreground text-xs">{employees.toLocaleString()} on LinkedIn</span>
                  ) : null}
               </span>
            )
         },
      }),
      column.display({
         id: 'followers',
         header: 'Followers',
         cell: ({ row }) =>
            row.original.card?.followers ? row.original.card.followers.toLocaleString() : <Muted>—</Muted>,
      }),
      column.display({
         id: 'website',
         header: 'Website',
         cell: ({ row }) => {
            const { website } = row.original

            return website && /^https?:\/\//i.test(website) ? (
               <Stop>
                  <a
                     className="text-primary block truncate underline-offset-4 hover:underline"
                     href={website}
                     target="_blank"
                     rel="noreferrer noopener"
                  >
                     {domainOf(website)}
                  </a>
               </Stop>
            ) : (
               <Muted>—</Muted>
            )
         },
      }),
      column.display({
         id: 'people',
         header: 'People',
         cell: ({ row }) => <PeopleCell people={row.original.people} onPerson={handlers.onPerson} />,
      }),
      column.display({
         id: 'status',
         header: 'Status',
         cell: ({ row }) => <LinkStatusBadge status={row.original.status} />,
      }),
      column.display({
         id: 'labels',
         header: 'Labels',
         cell: ({ row }) => (
            <Stop>
               <LabelCell
                  tags={row.original.tags}
                  kind="companies"
                  name={nameOf(row.original)}
                  save={tags => handlers.saveTags(row.original, tags)}
                  onFilter={handlers.onTag}
               />
            </Stop>
         ),
      }),
      column.accessor('createdAt', {
         header: ({ column: header }) => (
            <SortHeader label="Added" sorted={header.getIsSorted()} onClick={header.getToggleSortingHandler()} />
         ),
         sortDescFirst: true,
         cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(),
      }),
      column.display({
         id: 'readAt',
         header: 'Last read',
         cell: ({ row }) => {
            const visited = visitedText(row.original.visits[0])

            return (
               <span className="grid min-w-0">
                  {row.original.readAt ? (
                     <span title={new Date(row.original.readAt).toLocaleString()}>{timeAgo(row.original.readAt)}</span>
                  ) : (
                     <Muted>Not read</Muted>
                  )}
                  {visited ? (
                     <span className="text-muted-foreground truncate text-xs" title={visited}>
                        {visited}
                     </span>
                  ) : null}
               </span>
            )
         },
      }),
   ])

type Props = Handlers & {
   companies: Company[]
   loading: boolean
   error: string | undefined
   empty: string
   selectedSlug: string | null
   sort: CompanySort | undefined
   hidden: HiddenColumns
   hasMore: boolean
   loadingMore: boolean
   onSort: (sort: CompanySort | undefined) => void
   onMore: () => void
   onOpen: (company: Company) => void
}

// The Companies table (TanStack Table): only the visible rows are drawn (TanStack Virtual), the next page loads near the
// end, and the owner can hide columns. Brain sorts and filters.
export const CompaniesTable = ({
   companies,
   loading,
   error,
   empty,
   selectedSlug,
   sort,
   hidden,
   hasMore,
   loadingMore,
   onSort,
   onMore,
   onOpen,
   ...handlers
}: Props) => {
   const scroller = useRef<HTMLDivElement>(null)
   const ids = useMemo(() => companies.map(({ id }) => id), [companies])
   // Rebuilt every render on purpose: the cells read the selection and the busy row.
   const columns = columnsOf(ids, handlers)
   const sorting: SortingState = sort
      ? [
           {
              id: sort.by === 'name' ? 'name' : 'createdAt',
              desc: sort.desc,
           },
        ]
      : []
   const table = useTable({
      features,
      data: companies,
      columns,
      getRowId: row => row.id,
      state: {
         sorting,
         columnVisibility: hidden,
      },
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
      count: companies.length,
      getScrollElement: () => scroller.current,
      estimateSize: () => ROW_HEIGHT,
      overscan: 12,
   })
   const items = virtualizer.getVirtualItems()
   const last = items.at(-1)?.index ?? -1
   const top = items[0]?.start ?? 0
   const bottom = virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0)
   const width = table.getVisibleLeafColumns().length
   const height = useFillHeight(scroller)

   useEffect(() => {
      if (hasMore && !loadingMore && last >= companies.length - LOAD_AHEAD) {
         onMore()
      }
   }, [hasMore, loadingMore, last, companies.length, onMore])

   const message = (content: ReactNode, className = 'text-muted-foreground') => (
      <tr>
         <td colSpan={width} className={cn('h-32 p-4 text-center text-sm', className)}>
            {content}
         </td>
      </tr>
   )

   return (
      <div ref={scroller} className="bg-card relative min-h-64 overflow-auto rounded-xl border" style={{ height }}>
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
               {loading
                  ? Array.from({ length: 5 }, (_, index) => (
                       <tr key={index}>
                          <td colSpan={width} className="px-3 py-2">
                             <Skeleton className="h-10 w-full" />
                          </td>
                       </tr>
                    ))
                  : null}
               {error ? message(error, 'text-destructive') : null}
               {!loading && !error && companies.length === 0
                  ? message(
                       <span className="inline-flex flex-col items-center gap-2">
                          <Building2 className="size-6" />
                          {empty}
                       </span>
                    )
                  : null}
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
                        tabIndex={0}
                        aria-label={`Open ${nameOf(row.original)}`}
                        data-state={row.original.slug === selectedSlug ? 'selected' : undefined}
                        className="cursor-pointer"
                        onClick={() => onOpen(row.original)}
                        onKeyDown={event => {
                           if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                              event.preventDefault()
                              onOpen(row.original)
                           }
                        }}
                     >
                        {row.getVisibleCells().map(cell => (
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
                        Loading more companies…
                     </td>
                  </tr>
               ) : null}
            </TableBody>
         </table>
      </div>
   )
}
