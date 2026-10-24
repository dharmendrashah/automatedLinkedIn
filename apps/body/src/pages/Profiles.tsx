import { ListToolbar } from '@/components/links/list-toolbar'
import { LinkBulkBar } from '@/components/links/bulk-bar'
import { linkStatuses } from '@/components/links/link-statuses'
import { Pager } from '@/components/links/pager'
import { useSelection } from '@/components/links/use-selection'
import { useListState } from '@/components/links/use-list-state'
import { ViewPageDialog } from '@/components/links/view-page-dialog'
import { AddProfilesDialog } from '@/components/profiles/add-profiles-dialog'
import { EditProfileDialog } from '@/components/profiles/edit-profile-dialog'
import { ProfilesTable } from '@/components/profiles/profiles-table'
import { Button } from '@/components/ui/button'
import { Eye } from 'lucide-react'
import { useState } from 'react'

import { type Profile } from '@/components/profiles/types'

import { DetailDrawers } from '@/components/details/detail-drawers'
import { useDetailDrawer } from '@/components/details/use-detail-drawer'

import { trpc } from '../trpc'

export const Profiles = () => {
   const utils = trpc.useUtils()
   const state = useListState()
   const selection = useSelection()
   const [toEdit, setToEdit] = useState<Profile | null>(null)
   // The profile an account is asked to view; `null` inside means a pasted link.
   const [viewing, setViewing] = useState<{ profile: Profile | null } | null>(null)
   const drawer = useDetailDrawer()

   const list = trpc.linkedInProfile.list.useQuery(state.query, {
      retry: false,
      placeholderData: previous => previous,
   })

   const refresh = () => {
      void utils.linkedInProfile.list.invalidate()
      void utils.label.list.invalidate()
   }
   const archive = trpc.linkedInProfile.archive.useMutation({ onSuccess: refresh })
   const restore = trpc.linkedInProfile.restore.useMutation({ onSuccess: refresh })
   const labelMany = trpc.linkedInProfile.labelMany.useMutation({ onSuccess: refresh })
   const archiveMany = trpc.linkedInProfile.archiveMany.useMutation({ onSuccess: refresh })
   const update = trpc.linkedInProfile.update.useMutation()
   const saveTags = async (profile: Profile, tags: string[]) => {
      await update.mutateAsync({
         id: profile.id,
         tags,
      })
      await Promise.all([utils.linkedInProfile.list.invalidate(), utils.label.list.invalidate()])
   }

   const busyId = archive.isPending ? archive.variables?.id : restore.isPending ? restore.variables?.id : undefined
   const actionError = [archive, restore, labelMany, archiveMany].find(action => action.error)?.error?.message

   return (
      <div className="grid w-full gap-4 px-4 lg:px-6">
         <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
               <h2 className="text-lg font-semibold">LinkedIn profiles</h2>
               <p className="text-muted-foreground text-sm">
                  The people you want to reach. Paste their links to add them.
               </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
               <Button variant="outline" onClick={() => setViewing({ profile: null })}>
                  <Eye />
                  View a profile
               </Button>
               <AddProfilesDialog />
            </div>
         </div>

         <ListToolbar
            state={state}
            statuses={linkStatuses}
            kind="profiles"
            searchLabel="Search profiles"
            searchPlaceholder="Search name, company or link"
         />

         {actionError ? <p className="text-destructive text-sm">{actionError}</p> : null}

         <LinkBulkBar kind="profiles" selection={selection} labelMany={labelMany} archiveMany={archiveMany} />

         <ProfilesTable
            profiles={list.data?.items}
            loading={list.isPending}
            error={list.error?.message}
            busyId={busyId}
            onEdit={setToEdit}
            onView={profile => setViewing({ profile })}
            onArchive={profile => archive.mutate({ id: profile.id })}
            onRestore={profile => restore.mutate({ id: profile.id })}
            onTag={state.addTag}
            saveTags={saveTags}
            onOpen={profile => drawer.show('person', profile.slug)}
            selection={selection}
         />

         <Pager total={list.data?.total ?? 0} page={state.page} onPage={state.setPage} noun={['profile', 'profiles']} />

         <EditProfileDialog profile={toEdit} onClose={() => setToEdit(null)} />
         {viewing ? (
            <ViewPageDialog
               key={viewing.profile?.id ?? 'link'}
               kind="PROFILE"
               saved={viewing.profile ? { id: viewing.profile.id, name: viewing.profile.fullName ?? viewing.profile.slug } : null}
               onClose={() => setViewing(null)}
            />
         ) : null}
         <DetailDrawers kind="person" order={list.data?.items.map(({ slug }) => slug) ?? []} />
      </div>
   )
}
