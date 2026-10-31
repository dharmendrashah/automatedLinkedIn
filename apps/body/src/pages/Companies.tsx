import { AddCompaniesDialog } from '@/components/companies/add-companies-dialog'
import { CompaniesTable } from '@/components/companies/companies-table'
import { EditCompanyDialog } from '@/components/companies/edit-company-dialog'
import { COMPANY_COLUMNS, type CompanySort, useCompanies } from '@/components/companies/use-companies'
import { DetailDrawers } from '@/components/details/detail-drawers'
import { useDetailDrawer } from '@/components/details/use-detail-drawer'
import { LinkBulkBar } from '@/components/links/bulk-bar'
import { linkStatuses } from '@/components/links/link-statuses'
import { ListToolbar } from '@/components/links/list-toolbar'
import { useListState } from '@/components/links/use-list-state'
import { useSelection } from '@/components/links/use-selection'
import { ViewPageDialog } from '@/components/links/view-page-dialog'
import { MultiPick } from '@/components/my-network/filters/fields'
import { ColumnsMenu } from '@/components/table/columns-menu'
import { useHiddenColumns } from '@/components/table/use-hidden-columns'
import { Button } from '@/components/ui/button'
import { flagOf } from '@/lib/country-flag'
import { Eye } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'

import { type Company } from '@/components/companies/types'

import { trpc } from '../trpc'

const SORT_BY: Array<CompanySort['by']> = ['createdAt', 'name']

// `name.asc`, `createdAt.desc`; nothing is newest first.
const readSort = (value: string | null): CompanySort | undefined => {
   const [field, direction] = (value ?? '').split('.')
   const by = SORT_BY.find(item => item === field)

   return by
      ? {
           by,
           desc: direction === 'desc',
        }
      : undefined
}

export const Companies = () => {
   const utils = trpc.useUtils()
   const state = useListState()
   const selection = useSelection()
   const [params, setParams] = useSearchParams()
   const [toEdit, setToEdit] = useState<Company | null>(null)
   // The company an account is asked to view; `null` inside means a pasted link.
   const [viewing, setViewing] = useState<{ company: Company | null } | null>(null)
   const [hidden, setHidden] = useHiddenColumns('companies.hiddenColumns')
   const drawer = useDetailDrawer()

   const industries = params.getAll('industry')
   const countries = params.getAll('country')
   const sortParam = params.get('sort')
   const sort = useMemo(() => readSort(sortParam), [sortParam])
   const { page: _page, pageSize: _pageSize, ...listQuery } = state.query
   const { list, rows, total } = useCompanies({
      ...listQuery,
      ...(industries.length > 0 && { industries }),
      ...(countries.length > 0 && { countries }),
      ...(sort && { sort }),
   })
   const facets = trpc.linkedInCompany.facets.useQuery(undefined, { retry: false })

   const setList = (name: string, values: string[]) =>
      setParams(
         current => {
            const next = new URLSearchParams(current)

            next.delete(name)
            values.forEach(value => next.append(name, value))

            return next
         },
         { replace: true }
      )
   const setSort = (next: CompanySort | undefined) =>
      setParams(
         current => {
            const updated = new URLSearchParams(current)

            if (next) {
               updated.set('sort', `${next.by}.${next.desc ? 'desc' : 'asc'}`)
            } else {
               updated.delete('sort')
            }

            return updated
         },
         { replace: true }
      )

   const refresh = () => {
      void utils.linkedInCompany.list.invalidate()
      void utils.linkedInCompany.facets.invalidate()
      void utils.label.list.invalidate()
   }
   const archive = trpc.linkedInCompany.archive.useMutation({ onSuccess: refresh })
   const restore = trpc.linkedInCompany.restore.useMutation({ onSuccess: refresh })
   const labelMany = trpc.linkedInCompany.labelMany.useMutation({ onSuccess: refresh })
   const archiveMany = trpc.linkedInCompany.archiveMany.useMutation({ onSuccess: refresh })
   const update = trpc.linkedInCompany.update.useMutation()
   const saveTags = async (company: Company, tags: string[]) => {
      await update.mutateAsync({
         id: company.id,
         tags,
      })
      await Promise.all([utils.linkedInCompany.list.invalidate(), utils.label.list.invalidate()])
   }
   const more = useCallback(() => void list.fetchNextPage(), [list])

   const busyId = archive.isPending ? archive.variables?.id : restore.isPending ? restore.variables?.id : undefined
   const actionError = [archive, restore, labelMany, archiveMany].find(action => action.error)?.error?.message
   const filtered = Boolean(
      listQuery.search ||
      listQuery.status ||
      listQuery.tags ||
      listQuery.addedSince ||
      industries.length ||
      countries.length
   )

   return (
      <div className="grid w-full gap-4 px-4 lg:px-6">
         <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
               <h2 className="text-lg font-semibold">LinkedIn companies</h2>
               <p className="text-muted-foreground text-sm">
                  The companies you want to reach. Paste their links to add them.
               </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
               <Button variant="outline" onClick={() => setViewing({ company: null })}>
                  <Eye />
                  View a company
               </Button>
               <AddCompaniesDialog />
            </div>
         </div>

         <div className="flex flex-wrap items-center gap-2">
            <ListToolbar
               state={state}
               statuses={linkStatuses}
               kind="companies"
               searchLabel="Search companies"
               searchPlaceholder="Search name, industry or link"
            />
            <MultiPick
               compact
               label="Industry"
               placeholder="Any industry"
               options={(facets.data?.industries ?? []).map(({ value, count }) => ({
                  value,
                  label: value,
                  hint: String(count),
               }))}
               value={industries}
               onChange={values => setList('industry', values)}
            />
            <MultiPick
               compact
               label="Country"
               placeholder="Any country"
               options={(facets.data?.countries ?? []).map(({ value, count }) => ({
                  value,
                  label: value,
                  hint: String(count),
                  icon: flagOf(value) ?? undefined,
               }))}
               value={countries}
               onChange={values => setList('country', values)}
            />
            <div className="ml-auto">
               <ColumnsMenu columns={COMPANY_COLUMNS} hidden={hidden} onChange={setHidden} />
            </div>
         </div>

         {actionError ? <p className="text-destructive text-sm">{actionError}</p> : null}

         <LinkBulkBar kind="companies" selection={selection} labelMany={labelMany} archiveMany={archiveMany} />

         <CompaniesTable
            companies={rows}
            loading={list.isPending}
            error={list.error?.message}
            empty={
               filtered
                  ? 'No companies match these filters.'
                  : 'No companies yet. Use Add companies to paste some LinkedIn links.'
            }
            selectedSlug={drawer.open?.kind === 'company' ? drawer.open.slug : null}
            sort={sort}
            hidden={hidden}
            hasMore={Boolean(list.hasNextPage)}
            loadingMore={list.isFetchingNextPage}
            onSort={setSort}
            onMore={more}
            onOpen={company => drawer.show('company', company.slug)}
            selection={selection}
            busyId={busyId}
            onEdit={setToEdit}
            onView={company => setViewing({ company })}
            onArchive={company => archive.mutate({ id: company.id })}
            onRestore={company => restore.mutate({ id: company.id })}
            onTag={state.addTag}
            saveTags={saveTags}
         />

         <p className="text-muted-foreground text-sm">
            {list.isPending
               ? ''
               : `${rows.length < total ? `${rows.length} of ` : ''}${total} ${total === 1 ? 'company' : 'companies'}`}
         </p>

         <EditCompanyDialog company={toEdit} onClose={() => setToEdit(null)} />
         {viewing ? (
            <ViewPageDialog
               key={viewing.company?.id ?? 'link'}
               kind="COMPANY"
               saved={
                  viewing.company
                     ? { id: viewing.company.id, name: viewing.company.name ?? viewing.company.slug }
                     : null
               }
               onClose={() => setViewing(null)}
            />
         ) : null}
         <DetailDrawers kind="company" order={rows.map(({ slug }) => slug)} />
      </div>
   )
}
