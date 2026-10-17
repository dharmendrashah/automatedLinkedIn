import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Users } from 'lucide-react'

import { cn } from '@/lib/utils'

import { type Profile } from './types'

import { LinkStatusBadge } from '../links/link-status-badge'
import { RowActions } from '../links/row-actions'
import { StateRows } from '../links/state-rows'
import { TagBadges } from '../links/tag-badges'

const COLUMNS = 5

const formatDate = (value: string) => new Date(value).toLocaleDateString()

const details = ({ headline, company, location }: Profile) => [headline, company, location].filter(Boolean).join(' · ')

type Props = {
   profiles: Profile[] | undefined
   loading: boolean
   error: string | undefined
   busyId: string | undefined
   onEdit: (profile: Profile) => void
   onArchive: (profile: Profile) => void
   onRestore: (profile: Profile) => void
   onTag: (tag: string) => void
   onOpen: (profile: Profile) => void
}

export const ProfilesTable = ({ profiles, loading, error, busyId, onEdit, onArchive, onRestore, onTag, onOpen }: Props) => (
   <div className="overflow-hidden rounded-lg border">
      <Table>
         <TableHeader className="bg-muted/50">
            <TableRow>
               <TableHead>Profile</TableHead>
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
               empty={profiles?.length === 0}
               columns={COLUMNS}
               emptyIcon={Users}
               emptyText="No profiles found. Use Add profiles to paste some LinkedIn links."
            />
            {profiles?.map(profile => (
               <TableRow key={profile.id} className={cn(profile.archivedAt && 'opacity-60')}>
                  <TableCell>
                     <button
                        type="button"
                        className="font-medium underline-offset-4 hover:underline"
                        onClick={() => onOpen(profile)}
                     >
                        {profile.fullName ?? profile.slug}
                     </button>
                     {details(profile) ? <p className="text-muted-foreground text-xs">{details(profile)}</p> : null}
                  </TableCell>
                  <TableCell>
                     <span className="flex flex-wrap items-center gap-1">
                        <LinkStatusBadge status={profile.status} />
                        {profile.archivedAt ? <Badge variant="secondary">Archived</Badge> : null}
                     </span>
                  </TableCell>
                  <TableCell>
                     <TagBadges tags={profile.tags} onTag={onTag} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(profile.createdAt)}</TableCell>
                  <TableCell>
                     <RowActions
                        name={profile.fullName ?? profile.slug}
                        archived={Boolean(profile.archivedAt)}
                        busy={busyId === profile.id}
                        onEdit={() => onEdit(profile)}
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
