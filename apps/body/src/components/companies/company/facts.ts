import { type RouterOutputs } from '../../../trpc'

type CompanyDetail = RouterOutputs['companyPage']['detail']
export type Snapshot = NonNullable<CompanyDetail['snapshot']>
type Address = NonNullable<Snapshot['address']>

export type FactKind = 'industry' | 'founded' | 'size' | 'employees' | 'followers' | 'website' | 'headquarters'
export type Fact = { kind: FactKind; label: string; value: string; href?: string }

// "Bolt Ave, Montague Gardens, Western Cape 7441, South Africa"
export const addressText = ({ street, city, state, postalCode, country }: Address) =>
   [street, city, [state, postalCode].filter(Boolean).join(' '), country].filter(Boolean).join(', ')

// The site's name without the scheme, `www.` or a trailing slash.
export const domainOf = (link: string) => {
   try {
      const { hostname, pathname } = new URL(link)

      return `${hostname.replace(/^www\./, '')}${pathname === '/' ? '' : pathname.replace(/\/$/, '')}`
   } catch {
      return link
   }
}

// The key facts of a company read, each only when it has a value; the company row fills in before a read.
export const factsOf = (snapshot: Snapshot | null, company: CompanyDetail['company']): Fact[] => {
   const industry = snapshot?.industry ?? company.industry
   const category = snapshot?.industryCategory
   const range = snapshot?.employeeRange ?? company.size
   const website = snapshot?.website ?? (company.website?.startsWith('https://') ? company.website : null)
   const headquarters = snapshot?.address ? addressText(snapshot.address) : (snapshot?.headquarters ?? company.location)
   const facts: Array<Fact | null> = [
      industry
         ? {
              kind: 'industry',
              label: 'Industry',
              value: category && category !== industry ? `${industry} · ${category}` : industry,
           }
         : null,
      snapshot?.founded
         ? {
              kind: 'founded',
              label: 'Founded',
              value: String(snapshot.founded),
           }
         : null,
      range
         ? {
              kind: 'size',
              label: 'Company size',
              value: `${range.replace('-', '–')} employees`,
           }
         : null,
      snapshot?.employees
         ? {
              kind: 'employees',
              label: 'On LinkedIn',
              value: `${snapshot.employees.toLocaleString()} ${snapshot.employees === 1 ? 'member' : 'members'}`,
           }
         : null,
      snapshot?.followers
         ? {
              kind: 'followers',
              label: 'Followers',
              value: snapshot.followers.toLocaleString(),
           }
         : null,
      website
         ? {
              kind: 'website',
              label: 'Website',
              value: domainOf(website),
              href: website,
           }
         : null,
      headquarters
         ? {
              kind: 'headquarters',
              label: 'Headquarters',
              value: headquarters,
           }
         : null,
   ]

   return facts.filter((fact): fact is Fact => fact !== null)
}
