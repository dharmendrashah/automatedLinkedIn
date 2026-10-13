import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Archive, ArchiveRestore, Loader2, Pencil, Users } from 'lucide-react'

import { cn } from '@/lib/utils'

import { type Profile } from './types'

import { ProfileStatusBadge } from './profile-status'

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
}

export const ProfilesTable = ({ profiles, loading, error, busyId, onEdit, onArchive, onRestore, onTag }: Props) => (
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
            {loading ? (
               <TableRow>
                  <TableCell colSpan={COLUMNS}>
                     <Skeleton className="h-8 w-full" />
                  </TableCell>
               </TableRow>
            ) : null}
            {error ? (
               <TableRow>
                  <TableCell colSpan={COLUMNS} className="text-destructive h-24 text-center text-sm">
                     {error}
                  </TableCell>
               </TableRow>
            ) : null}
            {profiles?.length === 0 ? (
               <TableRow>
                  <TableCell colSpan={COLUMNS} className="text-muted-foreground h-24 text-center text-sm">
                     <Users className="mx-auto mb-2 size-5" />
                     No profiles found. Use Add profiles to paste some LinkedIn links.
                  </TableCell>
               </TableRow>
            ) : null}
            {profiles?.map(profile => (
               <TableRow key={profile.id} className={cn(profile.archivedAt && 'opacity-60')}>
                  <TableCell>
                     <a
                        className="font-medium underline-offset-4 hover:underline"
                        href={profile.url}
                        target="_blank"
                        rel="noreferrer noopener"
                     >
                        {profile.fullName ?? profile.slug}
                     </a>
                     {details(profile) ? <p className="text-muted-foreground text-xs">{details(profile)}</p> : null}
                  </TableCell>
                  <TableCell>
                     <span className="flex flex-wrap items-center gap-1">
                        <ProfileStatusBadge status={profile.status} />
                        {profile.archivedAt ? <Badge variant="secondary">Archived</Badge> : null}
                     </span>
                  </TableCell>
                  <TableCell>
                     <span className="flex flex-wrap gap-1">
                        {profile.tags.map(tag => (
                           <button key={tag} type="button" aria-label={`Show only ${tag}`} onClick={() => onTag(tag)}>
                              <Badge variant="secondary">{tag}</Badge>
                           </button>
                        ))}
                     </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(profile.createdAt)}</TableCell>
                  <TableCell>
                     <div className="flex items-center justify-end gap-1">
                        <Button
                           variant="ghost"
                           size="icon"
                           aria-label={`Edit ${profile.fullName ?? profile.slug}`}
                           onClick={() => onEdit(profile)}
                        >
                           <Pencil />
                        </Button>
                        <Button
                           variant="ghost"
                           size="icon"
                           disabled={busyId === profile.id}
                           aria-label={`${profile.archivedAt ? 'Restore' : 'Archive'} ${profile.fullName ?? profile.slug}`}
                           onClick={() => (profile.archivedAt ? onRestore(profile) : onArchive(profile))}
                        >
                           {busyId === profile.id ? (
                              <Loader2 className="animate-spin" />
                           ) : profile.archivedAt ? (
                              <ArchiveRestore />
                           ) : (
                              <Archive />
                           )}
                        </Button>
                     </div>
                  </TableCell>
               </TableRow>
            ))}
         </TableBody>
      </Table>
   </div>
)
