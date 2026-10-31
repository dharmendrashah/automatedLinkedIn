import { type RouterOutputs } from '../../../trpc'

type CompanyDetail = RouterOutputs['companyPage']['detail']
export type Snapshot = NonNullable<CompanyDetail['snapshot']>
type Address = NonNullable<Snapshot['address']>

export type FactKind =
   | 'industry'
   | 'category'
   | 'founded'
   | 'size'
   | 'employees'
   | 'followers'
   | 'website'
   | 'cta'
   | 'linkedin'
   | 'pageType'
   | 'status'
   | 'verified'
   | 'companyId'
   | 'headquarters'
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

const fact = (kind: FactKind, label: string, value: string | null | undefined, href?: string): Fact[] =>
   value
      ? [
           {
              kind,
              label,
              value,
              ...(href && { href }),
           },
        ]
      : []

const words = (value: string) => `${value.charAt(0)}${value.slice(1).toLowerCase()}`

const yesNo = (value: boolean | null | undefined, yes: string, no: string) =>
   value === true ? yes : value === false ? no : null

// The key facts of a company read, each only when it has a value; the company row fills in before a read.
export const factsOf = (snapshot: Snapshot | null, company: CompanyDetail['company']): Fact[] => {
   const range = snapshot?.employeeRange ?? company.size
   const website = snapshot?.website ?? (company.website?.startsWith('https://') ? company.website : null)
   const headquarters = snapshot?.address ? addressText(snapshot.address) : (snapshot?.headquarters ?? company.location)
   const employees = snapshot?.employees
   const cta = snapshot?.ctaUrl
   const linkedin = snapshot?.linkedinUrl

   return [
      ...fact('industry', 'Industry', snapshot?.industry ?? company.industry),
      ...fact('category', 'Industry category', snapshot?.industryCategory),
      ...fact('founded', 'Founded', snapshot?.founded ? String(snapshot.founded) : null),
      ...fact('size', 'Company size', range ? `${range.replace('-', '–')} employees` : null),
      ...fact(
         'employees',
         'On LinkedIn',
         employees ? `${employees.toLocaleString()} ${employees === 1 ? 'member' : 'members'}` : null
      ),
      ...fact('followers', 'Followers', snapshot?.followers ? snapshot.followers.toLocaleString() : null),
      ...fact('website', 'Website', website ? domainOf(website) : null, website ?? undefined),
      ...fact('cta', 'Call to action', cta ? domainOf(cta) : null, cta ?? undefined),
      ...fact('linkedin', 'LinkedIn page', linkedin ? domainOf(linkedin) : null, linkedin ?? undefined),
      ...fact('pageType', 'Page type', snapshot?.pageType ? words(snapshot.pageType) : null),
      ...fact('status', 'Status', yesNo(snapshot?.active, 'Active', 'Inactive')),
      ...fact('verified', 'Verified', yesNo(snapshot?.verified, 'Verified', 'Not verified')),
      ...fact('companyId', 'LinkedIn id', snapshot?.companyId),
      ...fact('headquarters', 'Headquarters', headquarters),
   ]
}
