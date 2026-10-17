import { ListToolbar } from '@/components/links/list-toolbar'
import { linkStatuses } from '@/components/links/link-statuses'
import { Pager } from '@/components/links/pager'
import { useListState } from '@/components/links/use-list-state'
import { PersonDrawer } from '@/components/people/person-drawer'
import { usePersonParam } from '@/components/people/use-person-param'
import { AddProfilesDialog } from '@/components/profiles/add-profiles-dialog'
import { EditProfileDialog } from '@/components/profiles/edit-profile-dialog'
import { ProfilesTable } from '@/components/profiles/profiles-table'
import { useState } from 'react'

import { type Profile } from '@/components/profiles/types'

import { trpc } from '../trpc'

export const Profiles = () => {
   const utils = trpc.useUtils()
   const state = useListState()
   const [toEdit, setToEdit] = useState<Profile | null>(null)
   const [person, setPerson] = usePersonParam()

   const list = trpc.linkedInProfile.list.useQuery(state.query, {
      retry: false,
      placeholderData: previous => previous,
   })

   const refresh = () => void utils.linkedInProfile.list.invalidate()
   const archive = trpc.linkedInProfile.archive.useMutation({ onSuccess: refresh })
   const restore = trpc.linkedInProfile.restore.useMutation({ onSuccess: refresh })

   const busyId = archive.isPending ? archive.variables?.id : restore.isPending ? restore.variables?.id : undefined
   const actionError = archive.error?.message ?? restore.error?.message

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

         <ListToolbar
            state={state}
            statuses={linkStatuses}
            searchLabel="Search profiles"
            searchPlaceholder="Search name, company or link"
         />

         {actionError ? <p className="text-destructive text-sm">{actionError}</p> : null}

         <ProfilesTable
            profiles={list.data?.items}
            loading={list.isPending}
            error={list.error?.message}
            busyId={busyId}
            onEdit={setToEdit}
            onArchive={profile => archive.mutate({ id: profile.id })}
            onRestore={profile => restore.mutate({ id: profile.id })}
            onTag={state.setTag}
            onOpen={profile => setPerson(profile.slug)}
         />

         <Pager total={list.data?.total ?? 0} page={state.page} onPage={state.setPage} noun={['profile', 'profiles']} />

         <EditProfileDialog profile={toEdit} onClose={() => setToEdit(null)} />
         <PersonDrawer
            slug={person}
            order={list.data?.items.map(({ slug }) => slug) ?? []}
            onOpen={setPerson}
            onClose={() => setPerson(null)}
         />
      </div>
   )
}
