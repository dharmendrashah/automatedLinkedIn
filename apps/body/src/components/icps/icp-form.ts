import { type RouterInputs, type RouterOutputs } from '../../trpc'

export type Icp = RouterOutputs['icp']['list'][number]
export type IcpInput = RouterInputs['icp']['create']
export type Seniority = IcpInput['seniorities'][number]

export const seniorityOptions: readonly { level: Seniority; label: string }[] = [
   {
      level: 'OWNER',
      label: 'Founder or owner',
   },
   {
      level: 'CXO',
      label: 'C-level',
   },
   {
      level: 'VP',
      label: 'VP',
   },
   {
      level: 'HEAD',
      label: 'Head of',
   },
   {
      level: 'DIRECTOR',
      label: 'Director',
   },
   {
      level: 'MANAGER',
      label: 'Manager',
   },
]

const isSeniority = (value: string): value is Seniority => seniorityOptions.some(({ level }) => level === value)

export const wordFields = [
   {
      key: 'includeTitles',
      label: 'Job titles to look for',
      placeholder: 'growth, sales, marketing',
   },
   {
      key: 'excludeTitles',
      label: 'Titles to leave out',
      placeholder: 'intern, student, recruiter',
   },
   {
      key: 'industries',
      label: 'Industries',
      placeholder: 'software, marketing services',
   },
   {
      key: 'companySizes',
      label: 'Company sizes',
      placeholder: '11-50, 51-200',
   },
   {
      key: 'locations',
      label: 'Locations',
      placeholder: 'london, berlin, united states',
   },
   {
      key: 'problemKeywords',
      label: 'Words that show someone has this problem',
      placeholder: 'pipeline, outbound, lead generation',
   },
] as const

type WordField = (typeof wordFields)[number]['key']

export type FormValues = Record<WordField | 'name', string> & { seniorities: Seniority[] }

export const splitWords = (text: string) =>
   text
      .split(',')
      .map(word => word.trim())
      .filter(Boolean)

export const toFormValues = (icp: Icp | null): FormValues => ({
   name: icp?.name ?? '',
   includeTitles: icp?.includeTitles.join(', ') ?? '',
   excludeTitles: icp?.excludeTitles.join(', ') ?? '',
   industries: icp?.industries.join(', ') ?? '',
   companySizes: icp?.companySizes.join(', ') ?? '',
   locations: icp?.locations.join(', ') ?? '',
   problemKeywords: icp?.problemKeywords.join(', ') ?? '',
   seniorities: icp?.seniorities.filter(isSeniority) ?? [],
})

export const toInput = (values: FormValues): IcpInput => ({
   name: values.name.trim(),
   includeTitles: splitWords(values.includeTitles),
   excludeTitles: splitWords(values.excludeTitles),
   industries: splitWords(values.industries),
   companySizes: splitWords(values.companySizes),
   locations: splitWords(values.locations),
   problemKeywords: splitWords(values.problemKeywords),
   seniorities: values.seniorities,
})
