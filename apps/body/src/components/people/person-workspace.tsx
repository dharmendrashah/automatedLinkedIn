import { NotesField } from '@/components/details/notes-field'
import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
   AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { readableError } from '@/lib/trpc-error'
import { Ban, ListPlus, UserPlus } from 'lucide-react'
import { useState } from 'react'

import { isLinkStatus, linkStatuses } from '../links/link-statuses'
import { isMemberStatus, memberStatuses } from '../lists/types'
import { Section } from './person-sections'
import { type PersonDetail } from './types'

import { trpc } from '../../trpc'

const Notes = ({ id, value, onSave }: { id: string; value: string | null; onSave: (next: string) => void }) => (
   <NotesField id={id} value={value} placeholder="What you know, why they fit, what to say" onSave={onSave} />
)

const Confirm = ({ trigger, title, description, action, onConfirm }: { trigger: React.ReactNode; title: string; description: string; action: string; onConfirm: () => void }) => (
   <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
         <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
         </AlertDialogHeader>
         <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>{action}</AlertDialogAction>
         </AlertDialogFooter>
      </AlertDialogContent>
   </AlertDialog>
)

// Where the person is in the owner's workspace, with the actions that fit: list status, move, notes, /profiles,
// do not contact.
export const Workspace = ({ person }: { person: PersonDetail }) => {
   const utils = trpc.useUtils()
   const [addTo, setAddTo] = useState('')
   const refresh = () => {
      void utils.person.detail.invalidate({ slug: person.slug })
      void utils.workflowList.members.invalidate()
      void utils.workflowList.lists.invalidate()
      void utils.linkedInProfile.list.invalidate()
   }
   const lists = trpc.workflowList.lists.useQuery()
   const updateMember = trpc.workflowList.updateMember.useMutation({ onSuccess: refresh })
   const moveMember = trpc.workflowList.moveMember.useMutation({ onSuccess: refresh })
   const deleteMember = trpc.workflowList.deleteMember.useMutation({ onSuccess: refresh })
   const doNotContact = trpc.workflowList.doNotContact.useMutation({ onSuccess: refresh })
   const addMember = trpc.workflowList.addMember.useMutation({ onSuccess: refresh })
   const updateProfile = trpc.linkedInProfile.update.useMutation({ onSuccess: refresh })
   const archive = trpc.linkedInProfile.archive.useMutation({ onSuccess: refresh })
   const restore = trpc.linkedInProfile.restore.useMutation({ onSuccess: refresh })
   const addProfile = trpc.linkedInProfile.create.useMutation({ onSuccess: refresh })
   const error = [updateMember, moveMember, deleteMember, doNotContact, addMember, updateProfile, archive, restore, addProfile].find(
      action => action.error
   )?.error
   const { member, profile, suppressed } = person
   const name = member?.name ?? profile?.fullName ?? person.slug
   const otherLists = lists.data?.filter(list => list.id !== member?.listId) ?? []

   return (
      <Section title="In your workspace">
         {suppressed ? (
            <p className="bg-destructive/10 text-destructive flex items-center gap-2 rounded-md p-2 text-sm">
               <Ban className="size-4" aria-hidden />
               Do not contact. They cannot be added to a list again.
            </p>
         ) : null}

         {member ? (
            <div className="grid gap-3 rounded-lg border p-3">
               <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">
                     In the list <span className="font-medium">{member.list.name}</span>
                  </span>
                  {member.tags.map(tag => (
                     <Badge key={tag} variant="secondary">
                        {tag}
                     </Badge>
                  ))}
               </div>
               <div className="flex flex-wrap gap-2">
                  <Select
                     value={member.status}
                     onValueChange={status => (isMemberStatus(status) ? updateMember.mutate({ id: member.id, status }) : undefined)}
                  >
                     <SelectTrigger className="w-40" aria-label="List status">
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        {Object.entries(memberStatuses).map(([value, { label }]) => (
                           <SelectItem key={value} value={value}>
                              {label}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
                  {otherLists.length > 0 ? (
                     <Select value="" onValueChange={listId => moveMember.mutate({ id: member.id, listId })}>
                        <SelectTrigger className="w-44" aria-label="Move to another list">
                           <SelectValue placeholder="Move to…" />
                        </SelectTrigger>
                        <SelectContent>
                           {otherLists.map(list => (
                              <SelectItem key={list.id} value={list.id}>
                                 {list.name}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  ) : null}
               </div>
               <Notes key={`member-${member.id}`} id={`notes-member-${member.id}`} value={member.notes} onSave={notes => updateMember.mutate({ id: member.id, notes })} />
               <div className="flex flex-wrap gap-2">
                  <Confirm
                     trigger={
                        <Button variant="outline" size="sm">
                           Remove from list
                        </Button>
                     }
                     title={`Remove ${name} from this list?`}
                     description="This cannot be undone."
                     action="Remove"
                     onConfirm={() => deleteMember.mutate({ id: member.id })}
                  />
                  <Confirm
                     trigger={
                        <Button variant="outline" size="sm" className="text-destructive">
                           <Ban />
                           Do not contact
                        </Button>
                     }
                     title={`Never contact ${name}?`}
                     description="They are removed from all your lists, their full profile is deleted, and they can never be added again."
                     action="Do not contact"
                     onConfirm={() => doNotContact.mutate({ id: member.id })}
                  />
               </div>
            </div>
         ) : null}

         {profile ? (
            <div className="grid gap-3 rounded-lg border p-3">
               <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">In your profiles</span>
                  {profile.archivedAt ? <Badge variant="secondary">Archived</Badge> : null}
               </div>
               <div className="flex flex-wrap gap-2">
                  <Select
                     value={profile.status}
                     onValueChange={status => (isLinkStatus(status) ? updateProfile.mutate({ id: profile.id, status }) : undefined)}
                  >
                     <SelectTrigger className="w-40" aria-label="Profile status">
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        {Object.entries(linkStatuses).map(([value, { label }]) => (
                           <SelectItem key={value} value={value}>
                              {label}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
                  <Button
                     variant="outline"
                     size="sm"
                     onClick={() => (profile.archivedAt ? restore.mutate({ id: profile.id }) : archive.mutate({ id: profile.id }))}
                  >
                     {profile.archivedAt ? 'Restore' : 'Archive'}
                  </Button>
               </div>
               <Notes key={`profile-${profile.id}`} id={`notes-profile-${profile.id}`} value={profile.notes} onSave={notes => updateProfile.mutate({ id: profile.id, notes })} />
            </div>
         ) : null}

         {suppressed ? null : (
            <div className="flex flex-wrap items-center gap-2">
               {profile ? null : (
                  <Button variant="outline" size="sm" disabled={addProfile.isPending} onClick={() => addProfile.mutate({ urls: person.url })}>
                     <UserPlus />
                     Add to profiles
                  </Button>
               )}
               {member || (lists.data?.length ?? 0) === 0 ? null : (
                  <>
                     <Select value={addTo} onValueChange={setAddTo}>
                        <SelectTrigger className="w-44" aria-label="List to add to">
                           <SelectValue placeholder="Choose a list" />
                        </SelectTrigger>
                        <SelectContent>
                           {lists.data?.map(list => (
                              <SelectItem key={list.id} value={list.id}>
                                 {list.name}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                     <Button
                        variant="outline"
                        size="sm"
                        disabled={!addTo || addMember.isPending}
                        onClick={() =>
                           addMember.mutate({
                              listId: addTo,
                              url: person.url,
                              name: profile?.fullName ?? undefined,
                              headline: profile?.headline ?? undefined,
                              location: profile?.location ?? undefined,
                           })
                        }
                     >
                        <ListPlus />
                        Add to list
                     </Button>
                  </>
               )}
            </div>
         )}

         {error ? <p className="text-destructive text-sm">{readableError(error)}</p> : null}
      </Section>
   )
}
