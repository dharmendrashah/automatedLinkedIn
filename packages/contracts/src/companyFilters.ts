import { z } from 'zod'

import { readFiltersText } from './filtersText'

// The filters of the Companies drawer (.plan/companies-filter-drawer.md) as brain's `linkedInCompany.list` takes them. One
// schema for the page's requests and for the filters an input block keeps (.plan/input-blocks-filters.md).

export const COMPANY_TEAM_KINDS = ['department', 'skill', 'location', 'service', 'school', 'field'] as const
export const COMPANY_READ_AGES = ['never', 'last7', 'last30', 'older30', 'older90'] as const
export const COMPANY_VISIT_AGES = ['never', 'last7', 'last30'] as const

const values = z.array(z.string().trim().min(1).max(200)).max(50).optional()
const range = z
   .object({
      min: z.number().int().min(0).max(10_000_000).optional(),
      max: z.number().int().min(0).max(10_000_000).optional(),
   })
   .optional()

export const companyFilterShape = {
   icpId: z.string().min(1).optional(),
   icpIncludeUnread: z.boolean().optional(),
   sizes: values,
   founded: range,
   places: values,
   offices: values,
   categories: values,
   team: z
      .array(
         z.object({
            kind: z.enum(COMPANY_TEAM_KINDS),
            values: z.array(z.string().trim().min(1).max(200)).min(1).max(50),
            min: z.number().int().min(1).max(100_000),
         })
      )
      .max(10)
      .optional(),
   specialities: values,
   specialitiesMode: z.enum(['all', 'any']).optional(),
   words: z
      .object({
         values: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
         match: z.enum(['any', 'all']),
      })
      .optional(),
   read: z.enum(COMPANY_READ_AGES).optional(),
   visited: z.enum(COMPANY_VISIT_AGES).optional(),
   notes: z.string().trim().min(1).max(200).optional(),
   employees: range,
   followers: range,
   verified: z.boolean().optional(),
   active: z.boolean().optional(),
   showcase: z.boolean().optional(),
   hasWebsite: z.boolean().optional(),
   hasJobs: z.boolean().optional(),
}

// What an input block keeps: the drawer's filters and the two pickers of its basics.
export const companyFiltersSchema = z.strictObject({
   ...companyFilterShape,
   industries: values,
   countries: values,
})

export type CompanyFiltersInput = z.infer<typeof companyFiltersSchema>

// The filters an input block keeps as text; empty or text that is not valid means none, and `error` says why.
export const readCompanyFilters = (text: string) => readFiltersText(companyFiltersSchema, text)
