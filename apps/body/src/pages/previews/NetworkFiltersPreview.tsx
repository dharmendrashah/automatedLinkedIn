import premiumMark from '@/assets/linkedin-premium.png'
import { FilterChips } from '@/components/my-network/filters/filter-chips'
import { type FilterOptions, FiltersSheet } from '@/components/my-network/filters/filters-sheet'
import {
   type DateRange,
   type InviteState,
   NO_FILTERS,
   type PeopleFilters,
   chipsOf,
} from '@/components/my-network/filters/model'
import { type PersonStatus, statusWord } from '@/components/my-network/words'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDocumentTitle } from '@/lib/page-title'
import { IconBrandLinkedin } from '@tabler/icons-react'
import { Download, ListFilter, Search, UserPlus } from 'lucide-react'
import { useMemo, useState } from 'react'

// Design preview of the My network filters on invented people (.plan/network-filters.md). Development server only.

type Sample = {
   id: string
   name: string
   headline: string
   company: string | null
   title: string | null
   country: [string, string] | null
   premium: boolean
   connectedTo: string[]
   connectedAt: string | null
   invite: InviteState
   lastSent: string | null
   lastReply: string | null
   replyWaiting: boolean
   lastTouch: string
   firstSeen: string
   labels: string[]
   status: PersonStatus
   read: boolean
}

const ACCOUNTS: FilterOptions['accounts'] = [
   { value: 'acc-1', label: 'Dharmendra' },
   { value: 'acc-2', label: 'Tripti' },
]

const person = (id: string, name: string, headline: string, rest: Partial<Sample>): Sample => ({
   id,
   name,
   headline,
   company: null,
   title: null,
   country: null,
   premium: false,
   connectedTo: [],
   connectedAt: null,
   invite: 'NONE',
   lastSent: null,
   lastReply: null,
   replyWaiting: false,
   lastTouch: '2026-10-29',
   firstSeen: '2026-10-01',
   labels: [],
   status: 'NEW',
   read: false,
   ...rest,
})

const PEOPLE: Sample[] = [
   person('1', 'Clara Dubois', 'Founder @ Lumen Labs | AI for revenue teams', {
      company: 'Lumen Labs',
      title: 'Founder',
      country: ['FR', 'France'],
      premium: true,
      connectedTo: ['acc-1'],
      connectedAt: '2025-11-02',
      lastSent: '2026-10-20',
      lastReply: '2026-10-28',
      replyWaiting: true,
      lastTouch: '2026-10-28',
      labels: ['hot', 'founder'],
      status: 'REPLIED',
      read: true,
   }),
   person('2', 'Jonas Becker', 'Head of Sales at Fernweh GmbH', {
      company: 'Fernweh GmbH',
      title: 'Head of Sales',
      country: ['DE', 'Germany'],
      connectedTo: ['acc-1', 'acc-2'],
      connectedAt: '2026-09-14',
      lastSent: '2026-10-25',
      lastTouch: '2026-10-25',
      labels: ['sales-leader'],
      status: 'CONTACTED',
      read: true,
   }),
   person('3', 'Priya Raman', 'GTM Engineer | Clay, n8n, outbound systems', {
      company: 'Orbit Growth',
      country: ['IN', 'India'],
      premium: true,
      invite: 'PENDING',
      lastTouch: '2026-10-27',
      firstSeen: '2026-10-26',
      labels: ['gtm'],
   }),
   person('4', 'Marco Bianchi', 'CEO @ Vela Studio | Brand and growth', {
      company: 'Vela Studio',
      title: 'Chief Executive Officer',
      country: ['IT', 'Italy'],
      connectedTo: ['acc-2'],
      connectedAt: '2024-06-30',
      lastTouch: '2026-08-11',
      labels: ['founder'],
      read: true,
   }),
   person('5', 'Sofia Lindqvist', 'Partnerships at Nordlys', {
      company: 'Nordlys',
      country: ['SE', 'Sweden'],
      invite: 'ACCEPTED',
      connectedTo: ['acc-1'],
      connectedAt: '2026-10-21',
      lastSent: '2026-10-22',
      lastTouch: '2026-10-22',
      firstSeen: '2026-10-15',
      status: 'CONTACTED',
   }),
   person('6', 'Ethan Walker', 'VP Revenue | SaaS | ex-HubSpot', {
      company: 'Brightline',
      title: 'VP Revenue',
      country: ['US', 'United States'],
      premium: true,
      invite: 'ENDED',
      lastTouch: '2026-09-30',
      labels: ['sales-leader', 'hot'],
      read: true,
   }),
   person('7', 'Aisha Khan', 'Talent Partner | Hiring engineers in Dubai', {
      company: 'Sandstone',
      country: ['AE', 'United Arab Emirates'],
      connectedTo: ['acc-1'],
      connectedAt: '2023-03-18',
      lastReply: '2026-07-02',
      lastTouch: '2026-07-02',
      status: 'NOT_INTERESTED',
   }),
   person('8', 'Lucas Martin', 'Co-founder, Pivot & Co', {
      company: 'Pivot & Co',
      title: 'Co-founder',
      country: ['FR', 'France'],
      connectedTo: ['acc-2'],
      connectedAt: '2026-10-05',
      lastTouch: '2026-10-05',
      labels: ['founder'],
      read: true,
   }),
   person('9', 'Hannah Schmidt', 'Marketing Lead at Kiefer', {
      company: 'Kiefer',
      firstSeen: '2026-10-28',
      lastTouch: '2026-10-28',
   }),
   person('10', 'Diego Alvarez', 'Founder | Bootstrapped to 2M ARR', {
      company: 'Rumbo',
      title: 'Founder',
      country: ['ES', 'Spain'],
      premium: true,
      connectedTo: ['acc-1'],
      connectedAt: '2025-02-11',
      lastSent: '2026-06-01',
      lastReply: '2026-06-03',
      lastTouch: '2026-06-03',
      labels: ['founder', 'hot'],
      status: 'DONE',
      read: true,
   }),
]

const flagOf = (code: string) =>
   String.fromCodePoint(...[...code.toUpperCase()].map(letter => 0x1f1a5 + letter.charCodeAt(0)))

const uniqueOptions = (values: Array<[string, string] | null>, icon?: (code: string) => string) =>
   [...new Map(values.flatMap(value => (value ? [value] : [])).map(([code, label]) => [code, label])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([code, label]) => ({
         value: label,
         label,
         icon: icon ? <span aria-hidden>{icon(code)}</span> : undefined,
         hint: `${PEOPLE.filter(row => row.country?.[1] === label || row.company === label || row.labels.includes(label)).length}`,
      }))

const OPTIONS: FilterOptions = {
   companies: uniqueOptions(PEOPLE.map(row => (row.company ? [row.company, row.company] : null))),
   countries: uniqueOptions(
      PEOPLE.map(row => row.country),
      flagOf
   ),
   labels: uniqueOptions(PEOPLE.flatMap(row => row.labels.map((label): [string, string] => [label, label]))),
   accounts: ACCOUNTS,
}

const inRange = (value: string | null, { from, to }: DateRange) =>
   !from && !to ? true : value !== null && (!from || value >= from) && (!to || value <= to)

const has = (text: string | null, part: string | undefined) =>
   !part || (text ?? '').toLowerCase().includes(part.toLowerCase())

// What brain will answer, done here on the sample so the design can be tried.
const matches = (row: Sample, f: PeopleFilters) =>
   has(row.name, f.name) &&
   (f.companies.length === 0 || (row.company !== null && f.companies.includes(row.company))) &&
   (!f.title || (row.title !== null && has(row.title, f.title))) &&
   (f.countries.length === 0 || (row.country !== null && f.countries.includes(row.country[1]))) &&
   (!f.premium || row.premium === (f.premium === 'yes')) &&
   (!f.connection || row.connectedTo.length > 0 === (f.connection === 'connected')) &&
   (!f.connectedTo || row.connectedTo.includes(f.connectedTo)) &&
   inRange(row.connectedAt, f.connectedAt) &&
   (f.invites.length === 0 || f.invites.includes(row.invite)) &&
   inRange(row.lastSent, f.lastSent) &&
   inRange(row.lastReply, f.lastReply) &&
   (!f.neverMessaged || (row.lastSent === null && row.lastReply === null)) &&
   (!f.replyWaiting || row.replyWaiting) &&
   inRange(row.lastTouch, f.lastTouch) &&
   inRange(row.firstSeen, f.firstSeen) &&
   (!f.noLabels || row.labels.length === 0) &&
   (f.labels.length === 0 ||
      (f.labelsMode === 'all'
         ? f.labels.every(label => row.labels.includes(label))
         : f.labels.some(label => row.labels.includes(label)))) &&
   (f.statuses.length === 0 || f.statuses.includes(row.status)) &&
   (!f.profileRead || row.read === (f.profileRead === 'read'))

const daysAgo = (value: string) => {
   const days = Math.round((Date.parse('2026-10-30') - Date.parse(value)) / 86_400_000)

   return days === 0 ? 'today' : `${days} days ago`
}

const STARTERS: Array<[string, PeopleFilters]> = [
   ['None', NO_FILTERS],
   [
      'French founders, not connected',
      {
         ...NO_FILTERS,
         countries: ['France'],
         title: 'founder',
         connection: 'not-connected',
      },
   ],
   [
      'Connected this month, never messaged',
      {
         ...NO_FILTERS,
         connection: 'connected',
         connectedAt: { from: '2026-10-01', to: '2026-10-30' },
         neverMessaged: true,
      },
   ],
   [
      'Hot or founder, replied in 30 days',
      {
         ...NO_FILTERS,
         labels: ['hot', 'founder'],
         lastReply: { from: '2026-10-01', to: '2026-10-30' },
      },
   ],
]

export const NetworkFiltersPreview = () => {
   const [filters, setFilters] = useState<PeopleFilters>(NO_FILTERS)
   const [open, setOpen] = useState(false)
   const shown = useMemo(() => PEOPLE.filter(row => matches(row, filters)), [filters])
   const on = chipsOf(filters).length
   const accountName = (id: string) => ACCOUNTS.find(({ value }) => value === id)?.label ?? id

   useDocumentTitle('Filters preview')

   return (
      <div className="grid w-full gap-4 px-4 py-6 lg:px-6">
         <div className="bg-muted/60 text-muted-foreground flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-xs">
            <span className="font-medium">Design preview, invented people.</span>
            <span>Try a starting point:</span>
            {STARTERS.map(([word, value]) => (
               <Button key={word} variant="outline" size="sm" className="h-7 text-xs" onClick={() => setFilters(value)}>
                  {word}
               </Button>
            ))}
         </div>

         <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-xl font-semibold">My network</h1>
            <div className="flex items-center gap-2">
               <div className="relative w-72">
                  <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" aria-hidden />
                  <Input type="search" placeholder="Search name, company, profile link…" className="pl-8" />
               </div>
               <Button>
                  <UserPlus />
                  Add people
               </Button>
            </div>
         </div>

         <Tabs value="EVERYONE">
            <TabsList>
               <TabsTrigger value="NEEDS_ME">Needs me 1</TabsTrigger>
               <TabsTrigger value="WAITING">Waiting 2</TabsTrigger>
               <TabsTrigger value="EVERYONE">Everyone {PEOPLE.length}</TabsTrigger>
               <TabsTrigger value="DO_NOT_CONTACT">Do not contact 0</TabsTrigger>
            </TabsList>
         </Tabs>

         <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
               {['Found by: any', 'Fit: any', 'Label: any'].map(word => (
                  <Select key={word} value="any">
                     <SelectTrigger size="sm" className="w-44" aria-label={word}>
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        <SelectItem value="any">{word}</SelectItem>
                     </SelectContent>
                  </Select>
               ))}
               <Button variant={on > 0 ? 'secondary' : 'outline'} size="sm" onClick={() => setOpen(true)}>
                  <ListFilter />
                  Filters
                  {on > 0 ? <Badge className="ml-0.5 h-5 min-w-5 rounded-full px-1.5 tabular-nums">{on}</Badge> : null}
               </Button>
            </div>
            <Button variant="outline" size="sm">
               <Download />
               Export {on > 0 ? `${shown.length} shown` : ''}
            </Button>
         </div>

         <FilterChips
            value={filters}
            accountName={accountName}
            onChange={setFilters}
            onClearAll={() => setFilters(NO_FILTERS)}
         />

         <div className="overflow-hidden rounded-lg border">
            <Table>
               <TableHeader className="bg-muted/50">
                  <TableRow>
                     <TableHead>Person</TableHead>
                     <TableHead>Title</TableHead>
                     <TableHead>Connected</TableHead>
                     <TableHead>Last touch</TableHead>
                     <TableHead>Labels</TableHead>
                     <TableHead>Status</TableHead>
                  </TableRow>
               </TableHeader>
               <TableBody>
                  {shown.map(row => (
                     <TableRow key={row.id}>
                        <TableCell className="max-w-96">
                           <div className="grid">
                              {row.company ? (
                                 <span className="text-muted-foreground text-xs">{row.company}</span>
                              ) : null}
                              <span className="flex items-center gap-1.5 font-medium">
                                 {row.name}
                                 {row.premium ? (
                                    <img
                                       src={premiumMark}
                                       alt="LinkedIn Premium"
                                       title="LinkedIn Premium"
                                       className="size-4 rounded-[3px]"
                                    />
                                 ) : (
                                    <IconBrandLinkedin className="text-muted-foreground size-4" aria-label="LinkedIn" />
                                 )}
                                 {row.country ? (
                                    <span title={row.country[1]} aria-label={row.country[1]} role="img">
                                       {flagOf(row.country[0])}
                                    </span>
                                 ) : null}
                              </span>
                              <span className="text-muted-foreground truncate text-xs">{row.headline}</span>
                           </div>
                        </TableCell>
                        <TableCell className="text-sm">
                           {row.title ?? <span className="text-muted-foreground text-xs">Read the profile</span>}
                        </TableCell>
                        <TableCell className="text-sm">
                           {row.connectedAt ? (
                              daysAgo(row.connectedAt)
                           ) : (
                              <span className="text-muted-foreground">Not connected</span>
                           )}
                        </TableCell>
                        <TableCell className="text-sm">{daysAgo(row.lastTouch)}</TableCell>
                        <TableCell>
                           <span className="flex flex-wrap gap-1">
                              {row.labels.map(label => (
                                 <Badge key={label} variant="secondary">
                                    {label}
                                 </Badge>
                              ))}
                           </span>
                        </TableCell>
                        <TableCell className="text-sm">{statusWord(row.status)}</TableCell>
                     </TableRow>
                  ))}
                  {shown.length === 0 ? (
                     <TableRow>
                        <TableCell colSpan={6} className="py-12 text-center">
                           <p className="font-medium">No one matches these filters</p>
                           <p className="text-muted-foreground text-sm">Remove a filter above, or start again.</p>
                           <Button variant="outline" size="sm" className="mt-3" onClick={() => setFilters(NO_FILTERS)}>
                              Clear all filters
                           </Button>
                        </TableCell>
                     </TableRow>
                  ) : null}
               </TableBody>
            </Table>
         </div>

         <FiltersSheet
            open={open}
            value={filters}
            options={OPTIONS}
            count={shown.length}
            onOpenChange={setOpen}
            onChange={setFilters}
         />
      </div>
   )
}
