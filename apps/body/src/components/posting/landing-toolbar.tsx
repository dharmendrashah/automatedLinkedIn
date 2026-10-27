import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { CalendarDays, Download, List } from 'lucide-react'
import { type ReactNode } from 'react'

import { type Account } from '../accounts/types'

import { accountName } from './accounts'
import { Combobox, type Option } from './combobox'
import { type Labels, type Scope, clientLabels, parseScope, scopeValue } from './landing'

export type View = 'list' | 'week'

type Props = {
   accounts: Account[]
   labels: Labels
   scope: Scope
   onScope: (scope: Scope) => void
   search: string
   onSearch: (value: string) => void
   view: View
   onView: (view: View) => void
   onExport: () => void
   canExport: boolean
   // Shown on the right, before Export posts.
   action: ReactNode
}

const optionsOf = (accounts: Account[], labels: Labels): Option[] => [
   { value: 'all', label: 'All accounts' },
   ...clientLabels(labels).map(label => ({ value: `client:${label}`, label, group: 'Clients', hint: 'client' })),
   ...accounts.map(account => ({
      value: `account:${account.id}`,
      label: accountName(account),
      group: 'Accounts',
      hint: labels.get(account.id) ?? undefined,
   })),
]

// Narrows the lists below to one account or client, by words, and switches between the list and the week. The account picker is
// shown only when there is more than one account to pick from.
export const LandingToolbar = ({
   accounts,
   labels,
   scope,
   onScope,
   search,
   onSearch,
   view,
   onView,
   onExport,
   canExport,
   action,
}: Props) => (
   <div className="flex flex-wrap items-center gap-2">
      {accounts.length > 1 ? (
         <Combobox
            options={optionsOf(accounts, labels)}
            value={scopeValue(scope)}
            onChange={value => onScope(parseScope(value))}
            placeholder="All accounts"
            label="Show the posts of"
            className="w-60"
         />
      ) : null}
      <Input
         type="search"
         value={search}
         onChange={event => onSearch(event.target.value)}
         placeholder="Search the words"
         aria-label="Search the words of your posts and drafts"
         className="w-56"
         maxLength={100}
      />
      <ToggleGroup
         type="single"
         size="sm"
         variant="outline"
         value={view}
         onValueChange={value => onView(value === 'week' ? 'week' : 'list')}
         aria-label="Show as"
      >
         <ToggleGroupItem value="list">
            <List />
            List
         </ToggleGroupItem>
         <ToggleGroupItem value="week">
            <CalendarDays />
            Week
         </ToggleGroupItem>
      </ToggleGroup>
      <div className="ml-auto flex flex-wrap items-center gap-2">
         {action}
         <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canExport}
            title="Downloads the posts shown, with their client, date, link and words, as a spreadsheet file."
            onClick={onExport}
         >
            <Download />
            Export posts
         </Button>
      </div>
   </div>
)
