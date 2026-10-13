import { type LinkStatus } from '../links/types'
import { type Company } from './types'

import { statusChange, tagsChange, textChange } from '../links/form-rules'

export type FormValues = Record<'name' | 'industry' | 'website' | 'size' | 'location' | 'notes', string> & {
   // Comma separated, as typed.
   tags: string
   status: LinkStatus
}

export const toFormValues = (company: Company): FormValues => ({
   name: company.name ?? '',
   industry: company.industry ?? '',
   website: company.website ?? '',
   size: company.size ?? '',
   location: company.location ?? '',
   notes: company.notes ?? '',
   tags: company.tags.join(', '),
   status: company.status,
})

export const buildChanges = (company: Company, values: FormValues) => ({
   name: textChange(company.name, values.name),
   industry: textChange(company.industry, values.industry),
   website: textChange(company.website, values.website),
   size: textChange(company.size, values.size),
   location: textChange(company.location, values.location),
   notes: textChange(company.notes, values.notes),
   tags: tagsChange(company.tags, values.tags),
   status: statusChange(company.status, values.status),
})
