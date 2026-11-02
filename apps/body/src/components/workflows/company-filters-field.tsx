import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { flagOf } from '@/lib/country-flag'
import { ListFilter } from 'lucide-react'
import { useMemo, useState } from 'react'

import { trpc } from '../../trpc'
import { CompanyFilterChips, CompanyFiltersSheet } from '../companies/filters/company-filters'
import { type Basics, type CompanyFilters, NO_BASICS, NO_FILTERS, blockFiltersText, chipsOf, readBlockFilters } from '../companies/filters/model'

type Props = {
   value: string
   search: string
   onChange: (text: string) => void
}

const listText = (items: string[]) =>
   items.length > 2 ? `${items.slice(0, 2).join(', ')} +${items.length - 2}` : items.join(', ')

// The Companies page's own drawer, for a Companies block; what it keeps is the filters as text.
export const CompanyFiltersField = ({ value, search, onChange }: Props) => {
   const [open, setOpen] = useState(false)
   const { filters, basics } = useMemo(() => readBlockFilters(value), [value])
   const facets = trpc.linkedInCompany.facets.useQuery(undefined, { retry: false })
   const icps = trpc.icp.list.useQuery(undefined, { retry: false })
   const icpName = (id: string) => icps.data?.find(icp => icp.id === id)?.name ?? 'Removed ICP'
   const save = (next: CompanyFilters, nextBasics: Basics) => onChange(blockFiltersText(next, nextBasics))
   const extra = [
      ...(['industries', 'countries'] as const).flatMap(key =>
         basics[key].length > 0
            ? [
                 {
                    key,
                    text: `${key === 'industries' ? 'Industry' : 'Country'}: ${listText(basics[key])}`,
                    onRemove: () =>
                       save(filters, {
                          ...basics,
                          [key]: [],
                       }),
                 },
              ]
            : []
      ),
   ]
   const on = chipsOf(filters, icpName).length + extra.length

   return (
      <div className="grid gap-2">
         <div>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
               <ListFilter />
               Filters
               {on > 0 ? <Badge variant="secondary">{on}</Badge> : null}
            </Button>
         </div>
         <CompanyFilterChips
            value={filters}
            icpName={icpName}
            extra={extra}
            onChange={next => save(next, basics)}
            onClearAll={() => save(NO_FILTERS, NO_BASICS)}
         />
         <CompanyFiltersSheet
            block
            open={open}
            value={filters}
            basics={basics}
            search={search || undefined}
            industries={(facets.data?.industries ?? []).map(({ value: name, count }) => ({
               value: name,
               label: name,
               hint: String(count),
            }))}
            countries={(facets.data?.countries ?? []).map(({ value: name, count }) => ({
               value: name,
               label: name,
               hint: String(count),
               icon: flagOf(name) ?? undefined,
            }))}
            icps={(icps.data ?? []).map(icp => ({
               value: icp.id,
               label: icp.name,
            }))}
            onOpenChange={setOpen}
            onApply={save}
         />
      </div>
   )
}
