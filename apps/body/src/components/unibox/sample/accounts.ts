import { type UniboxAccount } from '../types'

const HOUR = 3_600_000
const DAY = 24 * HOUR

type Seed = Omit<UniboxAccount, 'lastReadAt'> & { readAgo: number | undefined }

// Invented accounts, the same on every run. Two share a name (their handles tell them apart), and some are not in a state to send.
const SEEDS: Seed[] = [
   {
      id: 'acc-01',
      name: 'Ada Chen',
      handle: 'ada@acme-sales.test',
      headline: 'Head of Growth at Acme Sales',
      state: 'ACTIVE',
      readAgo: 4 * 60_000,
   },
   {
      id: 'acc-02',
      name: 'Marcus Webb',
      handle: 'marcus@acme-sales.test',
      headline: 'Account Executive at Acme Sales',
      state: 'ACTIVE',
      readAgo: 9 * 60_000,
   },
   {
      id: 'acc-03',
      name: 'Priya Nair',
      handle: 'priya@beta-growth.test',
      headline: 'Founder at Beta Growth',
      state: 'ACTIVE',
      readAgo: 2 * 60_000,
   },
   {
      id: 'acc-04',
      name: 'Sam Rivera',
      handle: 'sam@beta-growth.test',
      headline: 'Partnerships at Beta Growth',
      state: 'ACTIVE',
      readAgo: 15 * 60_000,
   },
   {
      id: 'acc-05',
      name: 'Sam Rivera',
      handle: 'sam.rivera@northwind.test',
      headline: 'Sales Lead at Northwind',
      state: 'ACTIVE',
      readAgo: 6 * 60_000,
   },
   {
      id: 'acc-06',
      name: 'Lena Fischer',
      handle: 'lena@northwind.test',
      headline: 'Marketing Director at Northwind',
      state: 'ACTIVE',
      readAgo: 11 * 60_000,
   },
   {
      id: 'acc-07',
      name: 'Tomás Herrera',
      handle: 'tomas@globex.test',
      headline: 'VP Sales at Globex',
      state: 'ACTIVE',
      readAgo: 3 * 60_000,
   },
   {
      id: 'acc-08',
      name: 'Hana Kobayashi',
      handle: 'hana@globex.test',
      headline: 'Business Development at Globex',
      state: 'ACTIVE',
      readAgo: 20 * 60_000,
   },
   {
      id: 'acc-09',
      name: 'Olivia Grant',
      handle: 'olivia@initech.test',
      headline: 'Growth Consultant at Initech',
      state: 'ACTIVE',
      readAgo: 7 * 60_000,
   },
   {
      id: 'acc-10',
      name: 'Daniel Okafor',
      handle: 'daniel@initech.test',
      headline: 'Sales Director at Initech',
      state: 'PAUSED',
      readAgo: 3 * DAY,
   },
   {
      id: 'acc-11',
      name: 'Mia Johansson',
      handle: 'mia@umbrella.test',
      headline: 'Partner at Umbrella Agency',
      state: 'DISCONNECTED',
      readAgo: 12 * DAY,
   },
   {
      id: 'acc-12',
      name: 'Ethan Brooks',
      handle: 'ethan@umbrella.test',
      headline: 'Outreach Lead at Umbrella Agency',
      state: 'RESTRICTED',
      readAgo: 2 * HOUR,
   },
]

export const sampleAccounts = (now: number): UniboxAccount[] =>
   SEEDS.map(({ readAgo, ...account }) => ({
      ...account,
      ...(readAgo !== undefined && { lastReadAt: now - readAgo }),
   }))
