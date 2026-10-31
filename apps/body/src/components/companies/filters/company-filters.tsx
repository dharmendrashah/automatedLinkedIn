import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { readableError } from '@/lib/trpc-error'
import { Loader2, Plus, X } from 'lucide-react'
import { type ReactNode, useEffect, useId, useState } from 'react'

import { type LinkStatus } from '../../links/types'

import { type RouterOutputs, trpc } from '../../../trpc'
import { ADDED_FILTERS, type AddedFilter, addedSince, isAddedFilter } from '../../labels/added'
import { LabelFilter } from '../../labels/label-filter'
import { linkStatuses } from '../../links/link-statuses'
import { Choice, Field, MultiPick, type Option, TextField, YesNo } from '../../my-network/filters/fields'
import {
   type Basics,
   type CompanyFilters,
   NO_BASICS,
   NO_FILTERS,
   READ_AGES,
   READ_WORDS,
   TEAM_KINDS,
   TEAM_WORDS,
   type TeamRule,
   VISIT_AGES,
   VISIT_WORDS,
   apiFilters,
   chipsOf,
} from './model'

type Facets = RouterOutputs['linkedInCompany']['drawerFacets']

const ANY = 'any'
const isStatus = (value: string): value is LinkStatus => value in linkStatuses

const COUNT_WAIT_MS = 300
const TEAM_MAX = 5

const optionsOf = (facet: Facets[keyof Facets] | undefined): Option[] =>
   (facet ?? []).map(({ value, count }) => ({
      value,
      label: value,
      hint: String(count),
   }))

const Group = ({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) => (
   <section className="grid min-w-0 gap-4">
      <div className="grid gap-0.5">
         <h3 className="text-sm font-semibold">{title}</h3>
         {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      </div>
      {children}
   </section>
)

// One answer from a list, or any; a select, so long answers never widen the drawer.
const Pick = <V extends string>({
   label,
   value,
   options,
   anyLabel,
   onChange,
}: {
   label: string
   value: V | undefined
   options: Array<[V, string]>
   anyLabel: string
   onChange: (value: V | undefined) => void
}) => {
   const id = useId()

   return (
      <Field label={label} htmlFor={id}>
         <Select
            value={value ?? ANY}
            onValueChange={next => onChange(options.find(([option]) => option === next)?.[0])}
         >
            <SelectTrigger id={id} className="w-full">
               <SelectValue />
            </SelectTrigger>
            <SelectContent>
               <SelectItem value={ANY}>{anyLabel}</SelectItem>
               {options.map(([option, word]) => (
                  <SelectItem key={option} value={option}>
                     {word}
                  </SelectItem>
               ))}
            </SelectContent>
         </Select>
      </Field>
   )
}

const NumberRange = ({
   label,
   value,
   placeholder,
   onChange,
}: {
   label: string
   value: CompanyFilters['founded']
   placeholder: [string, string]
   onChange: (value: CompanyFilters['founded']) => void
}) => {
   const id = useId()
   const read = (text: string) =>
      text.trim() === '' || Number.isNaN(Number(text)) ? undefined : Math.max(0, Math.round(Number(text)))

   return (
      <Field label={label} htmlFor={id}>
         <div className="flex items-center gap-2">
            <Input
               id={id}
               inputMode="numeric"
               placeholder={placeholder[0]}
               aria-label={`${label}, from`}
               value={value.min ?? ''}
               onChange={event => onChange({ ...value, min: read(event.target.value) })}
            />
            <span className="text-muted-foreground text-xs">to</span>
            <Input
               inputMode="numeric"
               placeholder={placeholder[1]}
               aria-label={`${label}, to`}
               value={value.max ?? ''}
               onChange={event => onChange({ ...value, max: read(event.target.value) })}
            />
         </div>
      </Field>
   )
}

const TeamRow = ({
   rule,
   facets,
   onChange,
   onRemove,
}: {
   rule: TeamRule
   facets: Facets | undefined
   onChange: (rule: TeamRule) => void
   onRemove: () => void
}) => (
   <div className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
      <span className="text-sm">At least</span>
      <Input
         className="w-16"
         inputMode="numeric"
         aria-label="At least this many people"
         value={rule.min}
         onChange={event => onChange({ ...rule, min: Math.max(1, Math.round(Number(event.target.value)) || 1) })}
      />
      <Select
         value={rule.kind}
         onValueChange={kind =>
            onChange({ ...rule, kind: TEAM_KINDS.find(item => item === kind) ?? rule.kind, values: [] })
         }
      >
         <SelectTrigger className="w-40" aria-label="Kind of team rule">
            <SelectValue />
         </SelectTrigger>
         <SelectContent>
            {TEAM_KINDS.map(kind => (
               <SelectItem key={kind} value={kind}>
                  {TEAM_WORDS[kind]}
               </SelectItem>
            ))}
         </SelectContent>
      </Select>
      <MultiPick
         compact
         label={TEAM_WORDS[rule.kind]}
         placeholder="Pick one or more"
         options={optionsOf(facets?.[rule.kind])}
         value={rule.values}
         onChange={values => onChange({ ...rule, values })}
      />
      <Button variant="ghost" size="icon" aria-label="Remove this team rule" onClick={onRemove}>
         <X />
      </Button>
   </div>
)

type SheetProps = {
   open: boolean
   value: CompanyFilters
   basics: Basics
   // The search box stays on the page; the count includes it.
   search: string | undefined
   industries: Option[]
   countries: Option[]
   icps: Option[]
   onOpenChange: (open: boolean) => void
   onApply: (value: CompanyFilters, basics: Basics) => void
}

const basicsQuery = (basics: Basics) => ({
   ...(basics.status === 'all' ? {} : { status: basics.status }),
   ...(basics.tags.length > 0 ? { tags: basics.tags } : {}),
   ...(basics.tags.length > 1 ? { tagMatch: basics.tagMatch } : {}),
   ...(basics.added === 'any' ? {} : { addedSince: addedSince(basics.added) }),
   includeArchived: basics.includeArchived,
   ...(basics.industries.length > 0 ? { industries: basics.industries } : {}),
   ...(basics.countries.length > 0 ? { countries: basics.countries } : {}),
})

// Every filter of the table but the search, grouped the way an ICP list is built. Changes wait in a draft and the button
// says how many companies they leave before they are applied.
export const CompanyFiltersSheet = ({
   open,
   value,
   basics,
   search,
   industries,
   countries,
   icps,
   onOpenChange,
   onApply,
}: SheetProps) => {
   const [draft, setDraft] = useState(value)
   const [draftBasics, setDraftBasics] = useState(basics)
   const [asked, setAsked] = useState(() => ({
      ...basicsQuery(basics),
      ...apiFilters(value),
   }))
   const facets = trpc.linkedInCompany.drawerFacets.useQuery(undefined, {
      enabled: open,
      retry: false,
   })
   const count = trpc.linkedInCompany.count.useQuery(
      {
         ...(search && { search }),
         ...asked,
      },
      {
         enabled: open,
         retry: false,
         placeholderData: previous => previous,
      }
   )
   const set = (change: Partial<CompanyFilters>) => setDraft(current => ({ ...current, ...change }))
   const setBasics = (change: Partial<Basics>) => setDraftBasics(current => ({ ...current, ...change }))
   const on = chipsOf(draft, id => id).length
   const team = draft.team

   useEffect(() => {
      const timer = window.setTimeout(
         () =>
            setAsked({
               ...basicsQuery(draftBasics),
               ...apiFilters(draft),
            }),
         COUNT_WAIT_MS
      )

      return () => window.clearTimeout(timer)
   }, [draft, draftBasics])

   const changeOpen = (next: boolean) => {
      if (next) {
         setDraft(value)
         setDraftBasics(basics)
      }

      onOpenChange(next)
   }

   const unreadId = useId()
   const archivedId = useId()

   return (
      <Sheet open={open} onOpenChange={changeOpen}>
         <SheetContent className="w-full gap-0 sm:max-w-xl">
            <SheetHeader className="border-b">
               <SheetTitle>Filters</SheetTitle>
               <SheetDescription>
                  {on === 0
                     ? 'Narrow the companies by what their read says.'
                     : `${on} on. Companies must match all of them.`}
               </SheetDescription>
            </SheetHeader>
            <div className="grid gap-6 overflow-x-hidden overflow-y-auto p-4">
               <Group title="Basics">
                  <Pick
                     label="Status"
                     anyLabel="All statuses"
                     options={Object.entries<{ label: string }>(linkStatuses).flatMap<[LinkStatus, string]>(
                        ([status, { label }]) => (isStatus(status) ? [[status, label]] : [])
                     )}
                     value={draftBasics.status === 'all' ? undefined : draftBasics.status}
                     onChange={status => setBasics({ status: status ?? 'all' })}
                  />
                  <Pick
                     label="Added"
                     anyLabel={ADDED_FILTERS.any}
                     options={Object.entries(ADDED_FILTERS).flatMap<[AddedFilter, string]>(([added, word]) =>
                        isAddedFilter(added) && added !== 'any' ? [[added, word]] : []
                     )}
                     value={draftBasics.added === 'any' ? undefined : draftBasics.added}
                     onChange={added => setBasics({ added: added ?? 'any' })}
                  />
                  <Field label="Labels">
                     <LabelFilter
                        id="companies-drawer-label-filter"
                        kind="companies"
                        tags={draftBasics.tags}
                        match={draftBasics.tagMatch}
                        onTags={tags => setBasics({ tags })}
                        onMatch={tagMatch => setBasics({ tagMatch })}
                     />
                  </Field>
                  <MultiPick
                     label="Industry"
                     placeholder="Any industry"
                     options={industries}
                     value={draftBasics.industries}
                     onChange={next => setBasics({ industries: next })}
                  />
                  <MultiPick
                     label="Country"
                     placeholder="Any country"
                     options={countries}
                     value={draftBasics.countries}
                     onChange={next => setBasics({ countries: next })}
                  />
                  <div className="flex items-center gap-2">
                     <Checkbox
                        id={archivedId}
                        checked={draftBasics.includeArchived}
                        onCheckedChange={checked => setBasics({ includeArchived: checked === true })}
                     />
                     <Label htmlFor={archivedId} className="font-normal">
                        Show archived companies too
                     </Label>
                  </div>
               </Group>
               <Separator />
               <Group
                  title="Ideal customer"
                  hint="Its industries, sizes, locations and keywords; titles are about people, so they are left out."
               >
                  <Pick
                     label="Matches ICP"
                     anyLabel="Any company"
                     options={icps.map(icp => [icp.value, icp.label])}
                     value={draft.icpId}
                     onChange={icpId => set({ icpId })}
                  />
                  {icps.length === 0 ? (
                     <p className="text-muted-foreground text-xs">
                        Save an ideal customer on the ICPs page to match it here.
                     </p>
                  ) : null}
                  {draft.icpId ? (
                     <div className="flex items-center gap-2">
                        <Checkbox
                           id={unreadId}
                           checked={draft.icpIncludeUnread}
                           onCheckedChange={checked => set({ icpIncludeUnread: checked === true })}
                        />
                        <Label htmlFor={unreadId} className="font-normal">
                           Include companies not read yet (unknown fit)
                        </Label>
                     </div>
                  ) : null}
               </Group>
               <Separator />
               <Group title="Fit">
                  <MultiPick
                     label="Size (company says)"
                     placeholder="Any size"
                     options={optionsOf(facets.data?.size)}
                     value={draft.sizes}
                     onChange={sizes => set({ sizes })}
                  />
                  <NumberRange
                     label="Founded"
                     placeholder={['From year', 'To year']}
                     value={draft.founded}
                     onChange={founded => set({ founded })}
                  />
                  <MultiPick
                     label="HQ city or state"
                     placeholder="Anywhere"
                     options={optionsOf(facets.data?.place)}
                     value={draft.places}
                     onChange={places => set({ places })}
                  />
                  <MultiPick
                     label="Has an office in"
                     placeholder="Anywhere"
                     options={optionsOf(facets.data?.office)}
                     value={draft.offices}
                     onChange={offices => set({ offices })}
                  />
                  <MultiPick
                     label="Industry category"
                     placeholder="Any category"
                     options={optionsOf(facets.data?.category)}
                     value={draft.categories}
                     onChange={categories => set({ categories })}
                  />
               </Group>
               <Separator />
               <Group
                  title="Team"
                  hint="Among the top 15 listed for each company, so a missing value is not zero people."
               >
                  {team.map((rule, index) => (
                     <TeamRow
                        key={index}
                        rule={rule}
                        facets={facets.data}
                        onChange={next => set({ team: team.map((item, other) => (other === index ? next : item)) })}
                        onRemove={() => set({ team: team.filter((_, other) => other !== index) })}
                     />
                  ))}
                  {team.length < TEAM_MAX ? (
                     <Button
                        variant="outline"
                        size="sm"
                        className="justify-self-start"
                        onClick={() =>
                           set({
                              team: [
                                 ...team,
                                 {
                                    kind: 'department',
                                    values: [],
                                    min: 1,
                                 },
                              ],
                           })
                        }
                     >
                        <Plus />
                        Add a team rule
                     </Button>
                  ) : null}
               </Group>
               <Separator />
               <Group title="What they do">
                  <MultiPick
                     label="Specialities"
                     placeholder="Any speciality"
                     options={optionsOf(facets.data?.speciality)}
                     value={draft.specialities}
                     onChange={specialities => set({ specialities })}
                  />
                  <TextField
                     label="Tagline, about or specialities say"
                     value={draft.words || undefined}
                     placeholder="voip, managed security"
                     onChange={words => set({ words: words ?? '' })}
                  />
                  <Choice
                     label="Words to match"
                     options={[
                        ['any', 'Any of them'],
                        ['all', 'All of them'],
                     ]}
                     value={draft.wordsMatch}
                     onChange={wordsMatch => set({ wordsMatch: wordsMatch ?? 'any' })}
                  />
               </Group>
               <Separator />
               <Group title="Activity">
                  <Pick
                     label="Last read"
                     anyLabel="Any time, or never"
                     options={READ_AGES.map(age => [age, READ_WORDS[age]])}
                     value={draft.read}
                     onChange={read => set({ read })}
                  />
                  <Pick
                     label="Visited by your accounts"
                     anyLabel="Any time, or never"
                     options={VISIT_AGES.map(age => [age, VISIT_WORDS[age]])}
                     value={draft.visited}
                     onChange={visited => set({ visited })}
                  />
                  <TextField
                     label="Notes contain"
                     value={draft.notes || undefined}
                     placeholder="Why this account…"
                     onChange={notes => set({ notes: notes ?? '' })}
                  />
               </Group>
               <Separator />
               <Group title="More">
                  <NumberRange
                     label="People on LinkedIn"
                     placeholder={['At least', 'At most']}
                     value={draft.employees}
                     onChange={employees => set({ employees })}
                  />
                  <NumberRange
                     label="Followers"
                     placeholder={['At least', 'At most']}
                     value={draft.followers}
                     onChange={followers => set({ followers })}
                  />
                  <YesNo
                     label="Verified"
                     yes="Verified"
                     no="Not verified"
                     value={draft.verified}
                     onChange={verified => set({ verified })}
                  />
                  <YesNo
                     label="Page active"
                     yes="Active"
                     no="Inactive"
                     value={draft.active}
                     onChange={active => set({ active })}
                  />
                  <YesNo
                     label="Showcase page"
                     yes="Showcase"
                     no="Company page"
                     value={draft.showcase}
                     onChange={showcase => set({ showcase })}
                  />
                  <YesNo
                     label="Website"
                     yes="Has one"
                     no="None"
                     value={draft.hasWebsite}
                     onChange={hasWebsite => set({ hasWebsite })}
                  />
                  <YesNo
                     label="Jobs link"
                     yes="Has one"
                     no="None"
                     value={draft.hasJobs}
                     onChange={hasJobs => set({ hasJobs })}
                  />
                  <MultiPick
                     label="School"
                     placeholder="Any school"
                     options={optionsOf(facets.data?.school)}
                     value={draft.schools}
                     onChange={schools => set({ schools })}
                  />
                  <MultiPick
                     label="Field of study"
                     placeholder="Any field"
                     options={optionsOf(facets.data?.field)}
                     value={draft.fields}
                     onChange={fields => set({ fields })}
                  />
               </Group>
               {count.error ? <p className="text-destructive text-sm">{readableError(count.error)}</p> : null}
            </div>
            <SheetFooter className="flex-row justify-end gap-2 border-t">
               <Button
                  variant="outline"
                  onClick={() => {
                     setDraft(NO_FILTERS)
                     setDraftBasics(NO_BASICS)
                  }}
               >
                  Clear filters
               </Button>
               <Button
                  onClick={() => {
                     onApply(draft, draftBasics)
                     onOpenChange(false)
                  }}
               >
                  {count.isFetching ? <Loader2 className="animate-spin" /> : null}
                  {count.data === undefined
                     ? 'Show companies'
                     : `Show ${count.data.toLocaleString()} ${count.data === 1 ? 'company' : 'companies'}`}
               </Button>
            </SheetFooter>
         </SheetContent>
      </Sheet>
   )
}

type ChipsProps = {
   value: CompanyFilters
   icpName: (id: string) => string
   // Chips of the list's own filters (status, labels, added, industry, country, archived).
   extra: Array<{ key: string; text: string; onRemove: () => void }>
   onChange: (value: CompanyFilters) => void
   onClearAll: () => void
}

// The filters that are on, each removable, so the owner always sees why the list is short.
export const CompanyFilterChips = ({ value, icpName, extra, onChange, onClearAll }: ChipsProps) => {
   const chips = [
      ...extra,
      ...chipsOf(value, icpName).map(chip => ({
         key: chip.key,
         text: chip.text,
         onRemove: () => onChange({ ...value, ...chip.clear }),
      })),
   ]

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
                  onClick={chip.onRemove}
               >
                  <X className="size-3" />
               </button>
            </span>
         ))}
         <Button variant="link" size="sm" className="h-7 px-2 text-xs" onClick={onClearAll}>
            Clear all
         </Button>
      </div>
   )
}
