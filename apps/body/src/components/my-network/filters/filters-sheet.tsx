import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { type ReactNode, useId } from 'react'

import { countText } from '../rows'
import { STATUSES } from '../words'
import { DateTimeRangeField } from './date-time-range'
import { Choice, MultiPick, type Option, TextField, YesNo } from './fields'
import { INVITE_STATES, INVITE_WORDS, NO_FILTERS, type PeopleFilters, chipsOf } from './model'

export type FilterOptions = {
   companies: Option[]
   countries: Option[]
   labels: Option[]
   accounts: Option[]
}

type Props = {
   open: boolean
   value: PeopleFilters
   options: FilterOptions
   // Matches in the chosen tab (null while counting), capped like the tab counts.
   count: number | null
   cap: number
   // The client and account pickers, first in the drawer.
   scope: ReactNode
   // Found by, Fit and Label.
   quick: ReactNode
   // How invites did over the chosen period, shown at the top while invites are live.
   results: ReactNode
   onOpenChange: (open: boolean) => void
   onChange: (value: PeopleFilters) => void
}

const Group = ({ title, children }: { title: string; children: ReactNode }) => (
   <section className="grid gap-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
   </section>
)

const Tick = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) => {
   const id = useId()

   return (
      <div className="flex items-center gap-2">
         <Checkbox id={id} checked={checked} onCheckedChange={on => onChange(on === true)} />
         <Label htmlFor={id} className="font-normal">
            {label}
         </Label>
      </div>
   )
}

// Every filter beyond the toolbar's, grouped by who they are, how they are tied to the owner, what happened, and the owner's work.
export const FiltersSheet = ({
   open,
   value,
   options,
   count,
   cap,
   scope,
   quick,
   results,
   onOpenChange,
   onChange,
}: Props) => {
   const set = (change: Partial<PeopleFilters>) => onChange({ ...value, ...change })
   const on = chipsOf(value).length

   return (
      <Sheet open={open} onOpenChange={onOpenChange}>
         <SheetContent className="w-full gap-0 sm:max-w-lg">
            <SheetHeader className="border-b">
               <SheetTitle>Filters</SheetTitle>
               <SheetDescription>
                  {on === 0 ? 'Narrow the people of this tab.' : `${on} on. People must match all of them.`}
               </SheetDescription>
            </SheetHeader>
            <div className="grid gap-6 overflow-y-auto p-4">
               {scope}
               {quick}
               {results ? <Group title="Results">{results}</Group> : null}
               <Group title="Who">
                  <TextField label="Name" value={value.name} placeholder="Contains…" onChange={name => set({ name })} />
                  <MultiPick
                     label="Company"
                     placeholder="Any company"
                     options={options.companies}
                     value={value.companies}
                     onChange={companies => set({ companies })}
                  />
                  <TextField
                     label="Title (from a profile read)"
                     value={value.title}
                     placeholder="Founder, Head of Sales…"
                     onChange={title => set({ title })}
                  />
                  <MultiPick
                     label="Country"
                     placeholder="Any country"
                     options={options.countries}
                     value={value.countries}
                     onChange={countries => set({ countries })}
                  />
                  <YesNo
                     label="LinkedIn Premium"
                     yes="Premium"
                     no="Not Premium"
                     value={value.premium}
                     onChange={premium => set({ premium })}
                  />
               </Group>
               <Separator />
               <Group title="Tie">
                  <Choice
                     label="Connection"
                     options={[
                        ['CONNECTED', 'Connected'],
                        ['NOT_CONNECTED', 'Not connected'],
                     ]}
                     value={value.connection}
                     onChange={connection =>
                        set({
                           connection,
                           ...(connection === 'CONNECTED'
                              ? {}
                              : {
                                   connectedTo: undefined,
                                   connectedAt: {},
                                }),
                        })
                     }
                  />
                  {value.connection === 'CONNECTED' && options.accounts.length > 1 ? (
                     <Choice
                        label="Connected to"
                        options={options.accounts.map(account => [account.value, account.label])}
                        value={value.connectedTo}
                        onChange={connectedTo => set({ connectedTo })}
                     />
                  ) : null}
                  <DateTimeRangeField
                     label="Connected between"
                     value={value.connectedAt}
                     disabled={value.connection === 'NOT_CONNECTED'}
                     onChange={connectedAt => set({ connectedAt })}
                  />
                  <MultiPick
                     label="Invite"
                     placeholder="Any invite state"
                     options={INVITE_STATES.map(state => ({
                        value: state,
                        label: INVITE_WORDS[state],
                     }))}
                     value={value.invites}
                     onChange={invites => set({ invites: INVITE_STATES.filter(state => invites.includes(state)) })}
                  />
               </Group>
               <Separator />
               <Group title="Activity">
                  <DateTimeRangeField
                     label="Last message from you"
                     value={value.lastSent}
                     onChange={lastSent => set({ lastSent })}
                  />
                  <DateTimeRangeField
                     label="Last reply from them"
                     value={value.lastReceived}
                     onChange={lastReceived => set({ lastReceived })}
                  />
                  <div className="grid gap-2">
                     <Tick
                        label="Never messaged"
                        checked={value.neverMessaged}
                        onChange={neverMessaged => set({ neverMessaged })}
                     />
                     <Tick
                        label="Their reply is waiting for you"
                        checked={value.replyWaiting}
                        onChange={replyWaiting => set({ replyWaiting })}
                     />
                  </div>
                  <DateTimeRangeField
                     label="Last touch between"
                     value={value.lastTouch}
                     onChange={lastTouch => set({ lastTouch })}
                  />
                  <DateTimeRangeField
                     label="First seen between"
                     value={value.firstSeen}
                     onChange={firstSeen => set({ firstSeen })}
                  />
               </Group>
               <Separator />
               <Group title="Your work">
                  <MultiPick
                     label="Labels"
                     placeholder="Any label"
                     options={options.labels}
                     value={value.labels}
                     onChange={labels => set({ labels, noLabels: false })}
                  />
                  {value.labels.length > 1 ? (
                     <Choice
                        label="Has"
                        options={[
                           ['any', 'Any of them'],
                           ['all', 'All of them'],
                        ]}
                        value={value.labelsMode}
                        onChange={labelsMode => set({ labelsMode: labelsMode ?? 'any' })}
                     />
                  ) : null}
                  <Tick
                     label="No labels yet"
                     checked={value.noLabels}
                     onChange={noLabels => set({ noLabels, ...(noLabels ? { labels: [] } : {}) })}
                  />
                  <MultiPick
                     label="Status"
                     placeholder="Any status"
                     options={STATUSES.map(([status, word]) => ({
                        value: status,
                        label: word,
                     }))}
                     value={value.statuses}
                     onChange={picked =>
                        set({ statuses: STATUSES.flatMap(([status]) => (picked.includes(status) ? [status] : [])) })
                     }
                  />
                  <YesNo
                     label="Profile"
                     yes="Read"
                     no="Not read"
                     value={value.profileRead}
                     onChange={profileRead => set({ profileRead })}
                  />
               </Group>
            </div>
            <SheetFooter className="flex-row justify-between border-t">
               <Button variant="ghost" disabled={on === 0} onClick={() => onChange(NO_FILTERS)}>
                  Clear all
               </Button>
               <Button onClick={() => onOpenChange(false)}>
                  {count === null
                     ? 'Counting…'
                     : count === 0
                       ? 'No one matches'
                       : `Show ${countText(count, cap)} ${count === 1 ? 'person' : 'people'}`}
               </Button>
            </SheetFooter>
         </SheetContent>
      </Sheet>
   )
}
