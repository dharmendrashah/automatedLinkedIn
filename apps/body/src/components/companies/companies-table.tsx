import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Building2 } from 'lucide-react'

import { cn } from '@/lib/utils'

import { type Company } from './types'

import { LabelCell } from '../labels/label-cell'
import { LinkStatusBadge } from '../links/link-status-badge'
import { RowActions } from '../links/row-actions'
import { SelectAllHead, SelectCell } from '../links/selection'
import { StateRows } from '../links/state-rows'
import { type Selection } from '../links/use-selection'
import { visitedText } from '../links/visit-form'

const COLUMNS = 7

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
   onView: (company: Company) => void
   onArchive: (company: Company) => void
   onRestore: (company: Company) => void
   onTag: (tag: string) => void
   saveTags: (company: Company, tags: string[]) => Promise<unknown>
   onOpen: (company: Company) => void
   selection: Selection
}

export const CompaniesTable = ({
   companies,
   loading,
   error,
   busyId,
   onEdit,
   onView,
   onArchive,
   onRestore,
   onTag,
   saveTags,
   onOpen,
   selection,
}: Props) => (
   <div className="overflow-hidden rounded-lg border">
      <Table>
         <TableHeader className="bg-muted/50">
            <TableRow>
               <SelectAllHead ids={companies?.map(({ id }) => id) ?? []} selection={selection} noun="company" />
               <TableHead>Company</TableHead>
               <TableHead>Website</TableHead>
               <TableHead>Status</TableHead>
               <TableHead>Labels</TableHead>
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
                  <SelectCell id={company.id} name={company.name ?? company.slug} selection={selection} />
                  <TableCell>
                     <button
                        type="button"
                        className="font-medium underline-offset-4 hover:underline"
                        onClick={() => onOpen(company)}
                     >
                        {company.name ?? company.slug}
                     </button>
                     {details(company) ? <p className="text-muted-foreground text-xs">{details(company)}</p> : null}
                     {visitedText(company.visits[0]) ? (
                        <p className="text-muted-foreground text-xs">{visitedText(company.visits[0])}</p>
                     ) : null}
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
                     <LabelCell
                        tags={company.tags}
                        kind="companies"
                        name={company.name ?? company.slug}
                        save={tags => saveTags(company, tags)}
                        onFilter={onTag}
                     />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(company.createdAt)}</TableCell>
                  <TableCell>
                     <RowActions
                        name={company.name ?? company.slug}
                        archived={Boolean(company.archivedAt)}
                        busy={busyId === company.id}
                        onEdit={() => onEdit(company)}
                        onView={() => onView(company)}
                        viewWhat="company page"
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
