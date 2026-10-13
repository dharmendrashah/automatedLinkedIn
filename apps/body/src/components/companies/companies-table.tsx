import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Building2 } from 'lucide-react'

import { cn } from '@/lib/utils'

import { type Company } from './types'

import { LinkStatusBadge } from '../links/link-status-badge'
import { RowActions } from '../links/row-actions'
import { StateRows } from '../links/state-rows'
import { TagBadges } from '../links/tag-badges'

const COLUMNS = 6

const formatDate = (value: string) => new Date(value).toLocaleDateString()

const details = ({ industry, size, location }: Company) => [industry, size, location].filter(Boolean).join(' · ')

// The server only stores web addresses, but a link is only made from one that starts with http or https.
const isWebAddress = (value: string) => /^https?:\/\//i.test(value)

type Props = {
   companies: Company[] | undefined
   loading: boolean
   error: string | undefined
   busyId: string | undefined
   onEdit: (company: Company) => void
   onArchive: (company: Company) => void
   onRestore: (company: Company) => void
   onTag: (tag: string) => void
}

export const CompaniesTable = ({ companies, loading, error, busyId, onEdit, onArchive, onRestore, onTag }: Props) => (
   <div className="overflow-hidden rounded-lg border">
      <Table>
         <TableHeader className="bg-muted/50">
            <TableRow>
               <TableHead>Company</TableHead>
               <TableHead>Website</TableHead>
               <TableHead>Status</TableHead>
               <TableHead>Tags</TableHead>
               <TableHead>Added</TableHead>
               <TableHead className="w-24" />
            </TableRow>
         </TableHeader>
         <TableBody>
            <StateRows
               loading={loading}
               error={error}
               empty={companies?.length === 0}
               columns={COLUMNS}
               emptyIcon={Building2}
               emptyText="No companies found. Use Add companies to paste some LinkedIn links."
            />
            {companies?.map(company => (
               <TableRow key={company.id} className={cn(company.archivedAt && 'opacity-60')}>
                  <TableCell>
                     <a
                        className="font-medium underline-offset-4 hover:underline"
                        href={company.url}
                        target="_blank"
                        rel="noreferrer noopener"
                     >
                        {company.name ?? company.slug}
                     </a>
                     {details(company) ? <p className="text-muted-foreground text-xs">{details(company)}</p> : null}
                  </TableCell>
                  <TableCell>
                     {company.website && isWebAddress(company.website) ? (
                        <a
                           className="text-sm underline-offset-4 hover:underline"
                           href={company.website}
                           target="_blank"
                           rel="noreferrer noopener"
                        >
                           {company.website}
                        </a>
                     ) : null}
                  </TableCell>
                  <TableCell>
                     <span className="flex flex-wrap items-center gap-1">
                        <LinkStatusBadge status={company.status} />
                        {company.archivedAt ? <Badge variant="secondary">Archived</Badge> : null}
                     </span>
                  </TableCell>
                  <TableCell>
                     <TagBadges tags={company.tags} onTag={onTag} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(company.createdAt)}</TableCell>
                  <TableCell>
                     <RowActions
                        name={company.name ?? company.slug}
                        archived={Boolean(company.archivedAt)}
                        busy={busyId === company.id}
                        onEdit={() => onEdit(company)}
                        onArchive={() => onArchive(company)}
                        onRestore={() => onRestore(company)}
                     />
                  </TableCell>
               </TableRow>
            ))}
         </TableBody>
      </Table>
   </div>
)
