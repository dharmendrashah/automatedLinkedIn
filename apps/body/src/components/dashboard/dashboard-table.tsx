import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { IconChevronLeft, IconChevronRight, IconChevronsLeft, IconChevronsRight, IconPlus } from '@tabler/icons-react'
import { type ColumnDef, FlexRender, type RowData, createColumnHelper, useTable } from '@tanstack/react-table'
import { type ReactNode, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { ColumnsMenu } from '../table/columns-menu'
import { type HiddenColumns, useHiddenColumns } from '../table/use-hidden-columns'
import { features } from './table-features'

// A tab: its label, the number of rows it holds, the columns the owner may hide (raw ids) and what it draws.
export type TabEntry = {
   key: string
   label: string
   count: number
   hideable: Array<[id: string, label: string]>
   content: (hidden: HiddenColumns) => ReactNode
}

type TabTableProps<Row extends RowData> = {
   rows: Row[]
   columns: Array<ColumnDef<typeof features, Row>>
   getRowId: (row: Row) => string
   emptyText: string
   emptyAction?: { label: string; to: string }
   // Adds a checkbox column; its header selects the rows of the current page only.
   selectable?: boolean
   // The bulk bar, drawn only while at least one row is selected. `keepSelected` leaves just those ids selected.
   renderBulk?: (selected: Row[], keepSelected: (ids: string[]) => void) => ReactNode
   // Makes the whole row a link (click or Enter) to this route.
   rowRoute?: (row: Row) => string
   hidden: HiddenColumns
}

const PAGE_SIZES = [10, 20, 30, 40, 50]

export const TabTable = <Row extends RowData>({
   rows,
   columns,
   getRowId,
   emptyText,
   emptyAction,
   selectable = false,
   renderBulk,
   rowRoute,
   hidden,
}: TabTableProps<Row>) => {
   const navigate = useNavigate()
   const allColumns = useMemo(() => {
      if (!selectable) return columns

      const selectColumn = createColumnHelper<typeof features, Row>().display({
         id: 'select',
         header: ({ table }) => (
            <div className="flex items-center justify-center">
               <Checkbox
                  checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
                  onCheckedChange={value => table.toggleAllPageRowsSelected(value === true)}
                  aria-label="Select all rows on this page"
               />
            </div>
         ),
         cell: ({ row }) => (
            <div className="flex items-center justify-center">
               <Checkbox
                  checked={row.getIsSelected()}
                  onCheckedChange={value => row.toggleSelected(value === true)}
                  aria-label="Select row"
               />
            </div>
         ),
      })

      return [selectColumn, ...columns]
   }, [selectable, columns])
   const table = useTable({
      features,
      data: rows,
      columns: allColumns,
      getRowId,
      enableRowSelection: selectable,
      state: { columnVisibility: hidden },
   })
   const selected = table.getSelectedRowModel().rows.map(row => row.original)
   const { pageIndex, pageSize } = table.state.pagination
   const keepSelected = (ids: string[]) => table.setRowSelection(Object.fromEntries(ids.map(id => [id, true])))

   return (
      <div className="flex flex-col gap-4">
         {renderBulk && selected.length > 0 ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/50 px-4 py-2 text-sm">
               <span className="font-medium">{selected.length} selected</span>
               {renderBulk(selected, keepSelected)}
            </div>
         ) : null}
         <div className="overflow-hidden rounded-lg border">
            <Table>
               <TableHeader className="sticky top-0 z-10 bg-muted">
                  {table.getHeaderGroups().map(headerGroup => (
                     <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map(header => (
                           <TableHead key={header.id} colSpan={header.colSpan}>
                              {header.isPlaceholder ? null : <FlexRender header={header} />}
                           </TableHead>
                        ))}
                     </TableRow>
                  ))}
               </TableHeader>
               <TableBody>
                  {table.getRowModel().rows.length > 0 ? (
                     table.getRowModel().rows.map(row => {
                        const route = rowRoute?.(row.original)

                        return (
                           <TableRow
                              key={row.id}
                              data-state={row.getIsSelected() && 'selected'}
                              className={route ? 'cursor-pointer' : undefined}
                              tabIndex={route ? 0 : undefined}
                              onClick={route ? () => navigate(route) : undefined}
                              onKeyDown={
                                 route
                                    ? event => {
                                         if (event.key === 'Enter' && event.target === event.currentTarget) {
                                            navigate(route)
                                         }
                                      }
                                    : undefined
                              }
                           >
                              {row.getVisibleCells().map(cell => (
                                 <TableCell key={cell.id}>
                                    <FlexRender cell={cell} />
                                 </TableCell>
                              ))}
                           </TableRow>
                        )
                     })
                  ) : (
                     <TableRow>
                        <TableCell colSpan={table.getVisibleLeafColumns().length} className="h-24 text-center">
                           <div className="flex flex-col items-center gap-3">
                              <span className="text-muted-foreground">{emptyText}</span>
                              {emptyAction ? (
                                 <Button asChild variant="outline" size="sm">
                                    <Link to={emptyAction.to}>{emptyAction.label}</Link>
                                 </Button>
                              ) : null}
                           </div>
                        </TableCell>
                     </TableRow>
                  )}
               </TableBody>
            </Table>
         </div>
         <div className="flex items-center justify-between px-4">
            <div className="hidden flex-1 text-sm text-muted-foreground lg:flex">
               {selectable ? `${selected.length} of ${rows.length} row(s) selected.` : null}
            </div>
            <div className="flex w-full items-center gap-8 lg:w-fit">
               <div className="hidden items-center gap-2 lg:flex">
                  <Label htmlFor="rows-per-page" className="text-sm font-medium">
                     Rows per page
                  </Label>
                  <Select value={String(pageSize)} onValueChange={value => table.setPageSize(Number(value))}>
                     <SelectTrigger size="sm" className="w-20" id="rows-per-page">
                        <SelectValue placeholder={pageSize} />
                     </SelectTrigger>
                     <SelectContent side="top">
                        {PAGE_SIZES.map(size => (
                           <SelectItem key={size} value={String(size)}>
                              {size}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
               </div>
               <div className="flex w-fit items-center justify-center text-sm font-medium">
                  Page {pageIndex + 1} of {Math.max(1, table.getPageCount())}
               </div>
               <div className="ml-auto flex items-center gap-2 lg:ml-0">
                  <Button
                     variant="outline"
                     className="hidden h-8 w-8 p-0 lg:flex"
                     onClick={() => table.setPageIndex(0)}
                     disabled={!table.getCanPreviousPage()}
                  >
                     <span className="sr-only">Go to first page</span>
                     <IconChevronsLeft />
                  </Button>
                  <Button
                     variant="outline"
                     className="size-8"
                     size="icon"
                     onClick={() => table.previousPage()}
                     disabled={!table.getCanPreviousPage()}
                  >
                     <span className="sr-only">Go to previous page</span>
                     <IconChevronLeft />
                  </Button>
                  <Button
                     variant="outline"
                     className="size-8"
                     size="icon"
                     onClick={() => table.nextPage()}
                     disabled={!table.getCanNextPage()}
                  >
                     <span className="sr-only">Go to next page</span>
                     <IconChevronRight />
                  </Button>
                  <Button
                     variant="outline"
                     className="hidden size-8 lg:flex"
                     size="icon"
                     onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                     disabled={!table.getCanNextPage()}
                  >
                     <span className="sr-only">Go to last page</span>
                     <IconChevronsRight />
                  </Button>
               </div>
            </div>
         </div>
      </div>
   )
}

// The hidden ids of one tab, without the tab prefix the shared hook stores them under.
const hiddenOf = (all: HiddenColumns, tabKey: string): HiddenColumns =>
   Object.fromEntries(
      Object.entries(all)
         .filter(([id]) => id.startsWith(`${tabKey}.`))
         .map(([id, shown]) => [id.slice(tabKey.length + 1), shown])
   )

export const DashboardTable = ({ tabs }: { tabs: TabEntry[] }) => {
   const [hidden, setHidden] = useHiddenColumns('dashboard.hiddenColumns', {})
   const [chosen, setChosen] = useState<string>()
   const active = tabs.find(tab => tab.key === chosen) ?? tabs[0]

   if (!active) return null

   return (
      <Tabs value={active.key} onValueChange={setChosen} className="w-full flex-col justify-start gap-6">
         <div className="flex items-center justify-between">
            <Label htmlFor="view-selector" className="sr-only">
               View
            </Label>
            <Select value={active.key} onValueChange={setChosen}>
               <SelectTrigger className="flex w-fit @4xl/main:hidden" size="sm" id="view-selector">
                  <SelectValue placeholder="Select a view" />
               </SelectTrigger>
               <SelectContent>
                  {tabs.map(tab => (
                     <SelectItem key={tab.key} value={tab.key}>
                        {tab.label}
                     </SelectItem>
                  ))}
               </SelectContent>
            </Select>
            <TabsList className="hidden **:data-[slot=badge]:size-5 **:data-[slot=badge]:rounded-full **:data-[slot=badge]:bg-muted-foreground/30 **:data-[slot=badge]:px-1 @4xl/main:flex">
               {tabs.map(tab => (
                  <TabsTrigger key={tab.key} value={tab.key}>
                     {tab.label} {tab.count > 0 ? <Badge variant="secondary">{tab.count}</Badge> : null}
                  </TabsTrigger>
               ))}
            </TabsList>
            <div className="flex items-center gap-2">
               <ColumnsMenu
                  columns={active.hideable.map(([id, label]) => [`${active.key}.${id}`, label])}
                  hidden={hidden}
                  onChange={setHidden}
               />
               <Button asChild variant="outline">
                  <Link to="/campaigns/new" aria-label="New campaign">
                     <IconPlus />
                     <span className="hidden lg:inline">New campaign</span>
                  </Link>
               </Button>
            </div>
         </div>
         <TabsContent value={active.key} className="relative flex flex-col gap-4 overflow-auto">
            {active.content(hiddenOf(hidden, active.key))}
         </TabsContent>
      </Tabs>
   )
}

export const DashboardTableSkeleton = () => (
   <div className="flex w-full flex-col gap-6">
      <div className="flex items-center justify-between">
         <Skeleton className="h-9 w-80" />
         <Skeleton className="h-9 w-48" />
      </div>
      <div className="overflow-hidden rounded-lg border">
         <Skeleton className="h-10 w-full rounded-none" />
         {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="mt-px h-14 w-full rounded-none" />
         ))}
      </div>
   </div>
)
