import { AddCompaniesDialog } from '@/components/companies/add-companies-dialog'
import { CompaniesTable } from '@/components/companies/companies-table'
import { CompanyFilterChips, CompanyFiltersSheet } from '@/components/companies/filters/company-filters'
import {
   type Basics,
   type CompanyFilters,
   NO_BASICS,
   NO_FILTERS,
   apiFilters,
   chipsOf,
   readFilters,
   writeFilters,
} from '@/components/companies/filters/model'
import { COMPANY_COLUMNS, type CompanySort, useCompanies } from '@/components/companies/use-companies'
import { DetailDrawers } from '@/components/details/detail-drawers'
import { useDetailDrawer } from '@/components/details/use-detail-drawer'
import { ADDED_FILTERS } from '@/components/labels/added'
import { LinkBulkBar } from '@/components/links/bulk-bar'
import { linkStatuses } from '@/components/links/link-statuses'
import { useListState } from '@/components/links/use-list-state'
import { useSelection } from '@/components/links/use-selection'
import { ColumnsMenu } from '@/components/table/columns-menu'
import { useHiddenColumns } from '@/components/table/use-hidden-columns'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { flagOf } from '@/lib/country-flag'
import { ListFilter, Search } from 'lucide-react'
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
   const [hidden, setHidden] = useHiddenColumns('companies.hiddenColumns')
   const drawer = useDetailDrawer()

   const industries = params.getAll('industry')
   const countries = params.getAll('country')
   const sortParam = params.get('sort')
   const sort = useMemo(() => readSort(sortParam), [sortParam])
   const filtersParam = params.get('filters')
   const drawerFilters = useMemo(() => readFilters(filtersParam), [filtersParam])
   const drawerQuery = useMemo(() => apiFilters(drawerFilters), [drawerFilters])
   const [filtersOpen, setFiltersOpen] = useState(false)
   const { page: _page, pageSize: _pageSize, ...listQuery } = state.query
   const base = {
      ...listQuery,
      ...(industries.length > 0 && { industries }),
      ...(countries.length > 0 && { countries }),
   }
   const { list, rows, total } = useCompanies({
      ...base,
      ...drawerQuery,
      ...(sort && { sort }),
   })
   const facets = trpc.linkedInCompany.facets.useQuery(undefined, { retry: false })
   const icps = trpc.icp.list.useQuery(undefined, { retry: false })
   const icpOptions = (icps.data ?? []).map(icp => ({
      value: icp.id,
      label: icp.name,
   }))
   const icpName = (id: string) => icps.data?.find(icp => icp.id === id)?.name ?? 'Removed ICP'
   const drawerOn = chipsOf(drawerFilters, icpName).length

   const setDrawerFilters = (next: CompanyFilters) =>
      setParams(
         current => {
            const updated = new URLSearchParams(current)
            const written = writeFilters(next)

            if (written) {
               updated.set('filters', written)
            } else {
               updated.delete('filters')
            }

            return updated
         },
         { replace: true }
      )

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
   const labelMany = trpc.linkedInCompany.labelMany.useMutation({ onSuccess: refresh })
   const archiveMany = trpc.linkedInCompany.archiveMany.useMutation({ onSuccess: refresh })
   const more = useCallback(() => void list.fetchNextPage(), [list])
   const update = trpc.linkedInCompany.update.useMutation()
   const saveTags = async (company: Company, tags: string[]) => {
      await update.mutateAsync({
         id: company.id,
         tags,
      })
      await Promise.all([utils.linkedInCompany.list.invalidate(), utils.label.list.invalidate()])
   }

   const actionError = [labelMany, archiveMany].find(action => action.error)?.error?.message
   const basics: Basics = {
      status: state.status,
      added: state.added,
      tags: state.tags,
      tagMatch: state.tagMatch,
      includeArchived: state.includeArchived,
      industries,
      countries,
   }
   const listText = (items: string[]) =>
      items.length > 2 ? `${items.slice(0, 2).join(', ')} +${items.length - 2}` : items.join(', ')
   const extraChips = [
      ...(state.status === 'all'
         ? []
         : [
              {
                 key: 'status',
                 text: `Status: ${linkStatuses[state.status].label}`,
                 onRemove: () => state.setStatus('all'),
              },
           ]),
      ...(state.added === 'any'
         ? []
         : [
              {
                 key: 'added',
                 text: ADDED_FILTERS[state.added],
                 onRemove: () => state.setAdded('any'),
              },
           ]),
      ...(state.tags.length > 0
         ? [
              {
                 key: 'labels',
                 text: `Labels: ${listText(state.tags)}${state.tags.length > 1 && state.tagMatch === 'all' ? ' (all)' : ''}`,
                 onRemove: () => state.setTags([]),
              },
           ]
         : []),
      ...(industries.length > 0
         ? [
              {
                 key: 'industry',
                 text: `Industry: ${listText(industries)}`,
                 onRemove: () => setList('industry', []),
              },
           ]
         : []),
      ...(countries.length > 0
         ? [
              {
                 key: 'country',
                 text: `Country: ${listText(countries)}`,
                 onRemove: () => setList('country', []),
              },
           ]
         : []),
      ...(state.includeArchived
         ? [
              {
                 key: 'archived',
                 text: 'Including archived',
                 onRemove: () => state.setIncludeArchived(false),
              },
           ]
         : []),
   ]
   const filtersOn = drawerOn + extraChips.length

   // One address change for everything the drawer applies, so no key overwrites another.
   const applyAll = (next: CompanyFilters, nextBasics: Basics) => {
      state.setStatus(nextBasics.status)
      state.setIncludeArchived(nextBasics.includeArchived)
      setParams(
         current => {
            const updated = new URLSearchParams(current)
            const written = writeFilters(next)
            const put = (key: string, value: string | null) => (value ? updated.set(key, value) : updated.delete(key))

            put('filters', written)
            put('labels', nextBasics.tags.join(',') || null)
            put('match', nextBasics.tags.length > 1 && nextBasics.tagMatch === 'all' ? 'all' : null)
            put('added', nextBasics.added === 'any' ? null : nextBasics.added)
            updated.delete('industry')
            nextBasics.industries.forEach(value => updated.append('industry', value))
            updated.delete('country')
            nextBasics.countries.forEach(value => updated.append('country', value))

            return updated
         },
         { replace: true }
      )
   }
   const filtered = Boolean(listQuery.search || filtersOn)

   return (
      <div className="grid w-full gap-4 px-4 lg:px-6">
         <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
               <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
               <Input
                  className="w-72 pl-8"
                  placeholder="Search name, industry or link"
                  aria-label="Search companies"
                  maxLength={100}
                  value={state.search}
                  onChange={event => state.setSearch(event.target.value)}
               />
            </div>
            <Button variant="outline" onClick={() => setFiltersOpen(true)}>
               <ListFilter />
               Filters
               {filtersOn > 0 ? <Badge variant="secondary">{filtersOn}</Badge> : null}
            </Button>
            <div className="ml-auto flex items-center gap-2">
               <ColumnsMenu columns={COMPANY_COLUMNS} hidden={hidden} onChange={setHidden} />
               <AddCompaniesDialog />
            </div>
         </div>

         <CompanyFilterChips
            value={drawerFilters}
            icpName={icpName}
            extra={extraChips}
            onChange={setDrawerFilters}
            onClearAll={() => applyAll(NO_FILTERS, NO_BASICS)}
         />

         <CompanyFiltersSheet
            open={filtersOpen}
            value={drawerFilters}
            basics={basics}
            search={listQuery.search}
            industries={(facets.data?.industries ?? []).map(({ value, count }) => ({
               value,
               label: value,
               hint: String(count),
            }))}
            countries={(facets.data?.countries ?? []).map(({ value, count }) => ({
               value,
               label: value,
               hint: String(count),
               icon: flagOf(value) ?? undefined,
            }))}
            icps={icpOptions}
            onOpenChange={setFiltersOpen}
            onApply={applyAll}
         />

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
            onTag={state.addTag}
            saveTags={saveTags}
         />

         <p className="text-muted-foreground text-sm">
            {list.isPending
               ? ''
               : `${rows.length < total ? `${rows.length} of ` : ''}${total} ${total === 1 ? 'company' : 'companies'}`}
         </p>

         <DetailDrawers kind="company" order={rows.map(({ slug }) => slug)} />
      </div>
   )
}
