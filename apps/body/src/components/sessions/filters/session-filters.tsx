import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { X } from 'lucide-react'
import { type ReactNode } from 'react'

import { DateTimeRangeField } from '../../my-network/filters/date-time-range'
import { Choice, MultiPick, type Option } from '../../my-network/filters/fields'
import {
   HAS,
   HAS_WORDS,
   NO_FILTERS,
   RESULTS,
   RESULT_WORDS,
   RETRIES,
   RETRIES_WORDS,
   type SessionFilters,
   TOOK,
   TOOK_WORDS,
   TRIGGERS,
   TRIGGER_WORDS,
   chipsOf,
   fixed,
   only,
} from './model'

export type FilterOptions = {
   accounts: Option[]
   tasks: Option[]
   verdicts: Option[]
   proxies: Option[]
   countries: Option[]
   // How many sessions each value has with the other filters on, by filter.
   hints: {
      results: Map<string, number>
      triggers: Map<string, number>
   }
}

export type Names = Parameters<typeof chipsOf>[1]

const Group = ({ title, children }: { title: string; children: ReactNode }) => (
   <section className="grid gap-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
   </section>
)

type SheetProps = {
   open: boolean
   value: SessionFilters
   options: FilterOptions
   names: Names
   onOpenChange: (open: boolean) => void
   onChange: (value: SessionFilters) => void
}

// Every filter of the Sessions page, grouped by what ran, how it went, and where it ran from.
export const SessionFiltersSheet = ({ open, value, options, names, onOpenChange, onChange }: SheetProps) => {
   const set = (change: Partial<SessionFilters>) => onChange({ ...value, ...change })
   const on = chipsOf(value, names).length

   return (
      <Sheet open={open} onOpenChange={onOpenChange}>
         <SheetContent className="w-full gap-0 sm:max-w-lg">
            <SheetHeader className="border-b">
               <SheetTitle>Filters</SheetTitle>
               <SheetDescription>
                  {on === 0 ? 'Narrow the sessions.' : `${on} on. Sessions must match all of them.`}
               </SheetDescription>
            </SheetHeader>
            <div className="grid gap-6 overflow-y-auto p-4">
               <Group title="What ran">
                  <MultiPick
                     label="Account"
                     placeholder="Any account"
                     options={options.accounts}
                     value={value.accounts}
                     onChange={accounts => set({ accounts })}
                  />
                  <MultiPick
                     label="Action"
                     placeholder="Any action"
                     options={options.tasks}
                     value={value.tasks}
                     onChange={tasks => set({ tasks })}
                  />
                  <MultiPick
                     label="Started"
                     placeholder="By hand, automatically or as a retry"
                     options={fixed(TRIGGERS, TRIGGER_WORDS, options.hints.triggers)}
                     value={value.triggers}
                     onChange={triggers => set({ triggers: only(TRIGGERS, triggers) })}
                  />
                  <Choice
                     label="Retries"
                     options={RETRIES.map(retries => [retries, RETRIES_WORDS[retries]])}
                     value={value.retries}
                     onChange={retries => set({ retries })}
                  />
               </Group>
               <Separator />
               <Group title="How it went">
                  <MultiPick
                     label="Result"
                     placeholder="Any result"
                     options={fixed(RESULTS, RESULT_WORDS, options.hints.results)}
                     value={value.results}
                     onChange={results => set({ results: only(RESULTS, results) })}
                  />
                  <MultiPick
                     label="Verdict"
                     placeholder="Any verdict"
                     options={options.verdicts}
                     value={value.verdicts}
                     onChange={verdicts => set({ verdicts })}
                  />
                  <DateTimeRangeField
                     label="Started between"
                     value={value.started}
                     onChange={started => set({ started })}
                  />
                  <MultiPick
                     label="Took"
                     placeholder="Any length"
                     options={fixed(TOOK, TOOK_WORDS)}
                     value={value.took}
                     onChange={took => set({ took: only(TOOK, took) })}
                  />
                  <MultiPick
                     label="Has files"
                     placeholder="Any files"
                     options={fixed(HAS, HAS_WORDS)}
                     value={value.has}
                     onChange={has => set({ has: only(HAS, has) })}
                  />
               </Group>
               <Separator />
               <Group title="Where from">
                  <MultiPick
                     label="Proxy"
                     placeholder="Any proxy"
                     options={options.proxies}
                     value={value.proxies}
                     onChange={proxies => set({ proxies })}
                  />
                  <MultiPick
                     label="Proxy country"
                     placeholder="Any country"
                     options={options.countries}
                     value={value.countries}
                     onChange={countries => set({ countries })}
                  />
               </Group>
            </div>
            <SheetFooter className="border-t">
               <Button variant="outline" disabled={on === 0} onClick={() => onChange({ ...NO_FILTERS, q: value.q })}>
                  Clear filters
               </Button>
               <Button onClick={() => onOpenChange(false)}>Done</Button>
            </SheetFooter>
         </SheetContent>
      </Sheet>
   )
}

type ChipsProps = {
   value: SessionFilters
   names: Names
   onChange: (value: SessionFilters) => void
}

// The filters that are on, each removable, so the owner always sees why the list is short.
export const SessionFilterChips = ({ value, names, onChange }: ChipsProps) => {
   const chips = chipsOf(value, names)

   if (chips.length === 0) {
      return null
   }

   return (
      <div className="flex flex-wrap items-center gap-1.5" aria-label="Filters on">
         {chips.map(chip => (
            <span
               key={chip.key}
               className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full py-1 pr-1 pl-3 text-xs font-medium"
            >
               {chip.text}
               <button
                  type="button"
                  className="hover:bg-primary/15 rounded-full p-0.5"
                  aria-label={`Remove ${chip.text}`}
                  onClick={() => onChange({ ...value, ...chip.clear })}
               >
                  <X className="size-3" />
               </button>
            </span>
         ))}
         <Button
            variant="link"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onChange({ ...NO_FILTERS, q: value.q })}
         >
            Clear all
         </Button>
      </div>
   )
}
