import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { flagOf } from '@/lib/country-flag'
import { ListFilter } from 'lucide-react'
import { useMemo, useState } from 'react'

import { trpc } from '../../trpc'
import { ALL_CLIENTS } from '../my-network/address'
import { FilterChips } from '../my-network/filters/filter-chips'
import { FiltersSheet } from '../my-network/filters/filters-sheet'
import { NO_FILTERS, apiFilters, blockFiltersText, chipsOf, readBlockFilters } from '../my-network/filters/model'

type Props = {
   value: string
   // The client the block takes from; empty for all of them.
   client: string
   onChange: (text: string) => void
}

const countOptions = (rows: Array<{ value: string; count: number }> | undefined, flags = false) =>
   (rows ?? []).map(({ value, count }) => ({
      value,
      label: value,
      hint: count.toLocaleString('en'),
      ...(flags && flagOf(value) ? { icon: <span aria-hidden>{flagOf(value)}</span> } : {}),
   }))

// My network's own drawer, for a Profiles block that takes people from My network; what it keeps is the filters as text.
export const NetworkFiltersField = ({ value, client, onChange }: Props) => {
   const [open, setOpen] = useState(false)
   const filters = useMemo(() => readBlockFilters(value), [value])
   const clientId = client || ALL_CLIENTS
   const clients = trpc.people.clients.useQuery(undefined, { retry: false })
   const options = trpc.people.filterOptions.useQuery({ clientId }, { enabled: open })
   const counts = trpc.people.counts.useQuery(
      {
         clientId,
         filters: apiFilters(filters),
      },
      {
         enabled: open,
         retry: false,
         placeholderData: previous => previous,
      }
   )
   const accounts = (clients.data ?? [])
      .filter(({ id }) => clientId === ALL_CLIENTS || id === clientId)
      .flatMap(item => item.accounts)
   const accountName = (id: string) => {
      const account = accounts.find(other => other.id === id)

      return account ? (account.displayName ?? account.email) : 'an account'
   }
   const save = (next: typeof filters) => onChange(blockFiltersText(next))
   const on = chipsOf(filters).length

   return (
      <div className="grid gap-2">
         <div>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
               <ListFilter />
               Filters
               {on > 0 ? <Badge variant="secondary">{on}</Badge> : null}
            </Button>
         </div>
         <FilterChips
            value={filters}
            accountName={accountName}
            onChange={save}
            onClearAll={() => save(NO_FILTERS)}
         />
         <FiltersSheet
            clientId={clientId}
            open={open}
            value={filters}
            options={{
               countries: countOptions(options.data?.countries, true),
               companies: countOptions(options.data?.companies),
               labels: countOptions(options.data?.labels),
               accounts: accounts.map(({ id }) => ({
                  value: id,
                  label: accountName(id),
               })),
            }}
            count={counts.isFetching ? null : (counts.data?.EVERYONE ?? 0)}
            cap={counts.data?.cap ?? 10_000}
            scope={null}
            quick={null}
            results={null}
            onOpenChange={setOpen}
            onChange={save}
         />
      </div>
   )
}
