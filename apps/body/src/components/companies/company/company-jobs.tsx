import { Badge } from '@/components/ui/badge'
import { Section } from '@/components/people/person-sections'

import { type RouterOutputs } from '../../../trpc'

type Jobs = RouterOutputs['companyPage']['detail']['jobs']

// The job postings workflows found for the company, a reason to reach out now.
export const CompanyJobs = ({ jobs }: { jobs: Jobs }) =>
   jobs.length === 0 ? null : (
      <Section title={`Job postings (${jobs.length})`}>
         <ul className="grid gap-2">
            {jobs.map(job => (
               <li key={job.id} className="grid gap-0.5 text-sm">
                  <a
                     className="font-medium underline-offset-4 hover:underline"
                     href={job.url}
                     target="_blank"
                     rel="noreferrer noopener"
                  >
                     {job.title ?? 'Job posting'}
                  </a>
                  <span className="text-muted-foreground text-xs">
                     {[
                        job.location,
                        job.workplace,
                        job.employment,
                        job.salary,
                        job.applicants === null ? null : `${job.applicants} applicants`,
                        job.posted,
                     ]
                        .filter(Boolean)
                        .join(' \u00b7 ')}
                  </span>
                  <span className="flex flex-wrap gap-1">
                     {job.tags.map(tag => (
                        <Badge key={tag} variant="secondary">
                           {tag}
                        </Badge>
                     ))}
                  </span>
               </li>
            ))}
         </ul>
      </Section>
   )
