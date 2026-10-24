import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Users } from 'lucide-react'

import { cn } from '@/lib/utils'

import { type Profile } from './types'
import { visitedText } from './visit-form'

import { LabelCell } from '../labels/label-cell'
import { LinkStatusBadge } from '../links/link-status-badge'
import { RowActions } from '../links/row-actions'
import { SelectAllHead, SelectCell } from '../links/selection'
import { type Selection } from '../links/use-selection'
import { StateRows } from '../links/state-rows'

const COLUMNS = 6

const formatDate = (value: string) => new Date(value).toLocaleDateString()

const details = ({ headline, company, location }: Profile) => [headline, company, location].filter(Boolean).join(' · ')

type Props = {
   profiles: Profile[] | undefined
   loading: boolean
   error: string | undefined
   busyId: string | undefined
   onEdit: (profile: Profile) => void
   onView: (profile: Profile) => void
   onArchive: (profile: Profile) => void
   onRestore: (profile: Profile) => void
   onTag: (tag: string) => void
   saveTags: (profile: Profile, tags: string[]) => Promise<unknown>
   onOpen: (profile: Profile) => void
   selection: Selection
}

export const ProfilesTable = ({
   profiles,
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
               <SelectAllHead ids={profiles?.map(({ id }) => id) ?? []} selection={selection} noun="profile" />
               <TableHead>Profile</TableHead>
               <TableHead>Status</TableHead>
               <TableHead>Labels</TableHead>
               <TableHead>Added</TableHead>
               <TableHead className="w-32" />
            </TableRow>
         </TableHeader>
         <TableBody>
            <StateRows
               loading={loading}
               error={error}
               empty={profiles?.length === 0}
               columns={COLUMNS}
               emptyIcon={Users}
               emptyText="No profiles found. Use Add profiles to paste some LinkedIn links."
            />
            {profiles?.map(profile => (
               <TableRow key={profile.id} className={cn(profile.archivedAt && 'opacity-60')}>
                  <SelectCell id={profile.id} name={profile.fullName ?? profile.slug} selection={selection} />
                  <TableCell>
                     <button
                        type="button"
                        className="font-medium underline-offset-4 hover:underline"
                        onClick={() => onOpen(profile)}
                     >
                        {profile.fullName ?? profile.slug}
                     </button>
                     {details(profile) ? <p className="text-muted-foreground text-xs">{details(profile)}</p> : null}
                     {visitedText(profile.visits[0]) ? (
                        <p className="text-muted-foreground text-xs">{visitedText(profile.visits[0])}</p>
                     ) : null}
                  </TableCell>
                  <TableCell>
                     <span className="flex flex-wrap items-center gap-1">
                        <LinkStatusBadge status={profile.status} />
                        {profile.archivedAt ? <Badge variant="secondary">Archived</Badge> : null}
                     </span>
                  </TableCell>
                  <TableCell>
                     <LabelCell
                        tags={profile.tags}
                        kind="profiles"
                        name={profile.fullName ?? profile.slug}
                        save={tags => saveTags(profile, tags)}
                        onFilter={onTag}
                     />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(profile.createdAt)}</TableCell>
                  <TableCell>
                     <RowActions
                        name={profile.fullName ?? profile.slug}
                        archived={Boolean(profile.archivedAt)}
                        busy={busyId === profile.id}
                        onEdit={() => onEdit(profile)}
                        onView={() => onView(profile)}
                        onArchive={() => onArchive(profile)}
                        onRestore={() => onRestore(profile)}
                     />
                  </TableCell>
               </TableRow>
            ))}
         </TableBody>
      </Table>
   </div>
)
