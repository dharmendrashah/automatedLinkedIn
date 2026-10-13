import { AddProfilesDialog } from '@/components/profiles/add-profiles-dialog'
import { EditProfileDialog } from '@/components/profiles/edit-profile-dialog'
import { profileStatuses } from '@/components/profiles/profile-statuses'
import { ProfilesTable } from '@/components/profiles/profiles-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, X } from 'lucide-react'
import { useDeferredValue, useState } from 'react'

import { type Profile, type ProfileStatus } from '@/components/profiles/types'

import { trpc } from '../trpc'

const PAGE_SIZE = 25

export const Profiles = () => {
   const utils = trpc.useUtils()
   const [search, setSearch] = useState('')
   const [status, setStatus] = useState<ProfileStatus | 'all'>('all')
   const [tag, setTag] = useState<string>()
   const [includeArchived, setIncludeArchived] = useState(false)
   const [page, setPage] = useState(1)
   const [toEdit, setToEdit] = useState<Profile | null>(null)
   const deferredSearch = useDeferredValue(search)

   const list = trpc.linkedInProfile.list.useQuery(
      {
         search: deferredSearch || undefined,
         status: status === 'all' ? undefined : status,
         tag,
         includeArchived,
         page,
         pageSize: PAGE_SIZE,
      },
      {
         retry: false,
         placeholderData: previous => previous,
      }
   )

   const refresh = () => void utils.linkedInProfile.list.invalidate()
   const archive = trpc.linkedInProfile.archive.useMutation({ onSuccess: refresh })
   const restore = trpc.linkedInProfile.restore.useMutation({ onSuccess: refresh })

   const busyId = archive.isPending ? archive.variables?.id : restore.isPending ? restore.variables?.id : undefined
   const actionError = archive.error?.message ?? restore.error?.message

   const total = list.data?.total ?? 0
   const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

   // A new filter starts again from the first page.
   const filter = <T,>(set: (value: T) => void, value: T) => {
      set(value)
      setPage(1)
   }

   return (
      <div className="grid w-full gap-4 px-4 lg:px-6">
         <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
               <h2 className="text-lg font-semibold">LinkedIn profiles</h2>
               <p className="text-muted-foreground text-sm">
                  The people you want to reach. Paste their links to add them.
               </p>
            </div>
            <AddProfilesDialog />
         </div>

         <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
               <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
               <Input
                  className="w-64 pl-8"
                  placeholder="Search name, company or link"
                  aria-label="Search profiles"
                  maxLength={100}
                  value={search}
                  onChange={event => filter(setSearch, event.target.value)}
               />
            </div>
            <Select value={status} onValueChange={value => filter(setStatus, value as ProfileStatus | 'all')}>
               <SelectTrigger className="w-40" aria-label="Filter by status">
                  <SelectValue />
               </SelectTrigger>
               <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {Object.entries(profileStatuses).map(([value, { label }]) => (
                     <SelectItem key={value} value={value}>
                        {label}
                     </SelectItem>
                  ))}
               </SelectContent>
            </Select>
            {tag ? (
               <Badge variant="secondary" className="gap-1">
                  Tag: {tag}
                  <button type="button" aria-label="Clear the tag filter" onClick={() => filter(setTag, undefined)}>
                     <X className="size-3" />
                  </button>
               </Badge>
            ) : null}
            <div className="flex items-center gap-2">
               <Checkbox
                  id="show-archived"
                  checked={includeArchived}
                  onCheckedChange={checked => filter(setIncludeArchived, checked === true)}
               />
               <Label htmlFor="show-archived">Show archived</Label>
            </div>
         </div>

         {actionError ? <p className="text-destructive text-sm">{actionError}</p> : null}

         <ProfilesTable
            profiles={list.data?.items}
            loading={list.isPending}
            error={list.error?.message}
            busyId={busyId}
            onEdit={setToEdit}
            onArchive={profile => archive.mutate({ id: profile.id })}
            onRestore={profile => restore.mutate({ id: profile.id })}
            onTag={value => filter(setTag, value)}
         />

         <div className="flex items-center justify-between text-sm">
            <p className="text-muted-foreground">
               {total} {total === 1 ? 'profile' : 'profiles'}
            </p>
            <div className="flex items-center gap-2">
               <span className="text-muted-foreground">
                  Page {page} of {pages}
               </span>
               <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
               </Button>
               <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                  Next
               </Button>
            </div>
         </div>

         <EditProfileDialog profile={toEdit} onClose={() => setToEdit(null)} />
      </div>
   )
}
