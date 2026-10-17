import { AddMemberDialog } from '@/components/lists/add-member-dialog'
import { ListNameDialog } from '@/components/lists/list-name-dialog'
import { MembersTable } from '@/components/lists/members-table'
import { ListToolbar } from '@/components/links/list-toolbar'
import { Pager } from '@/components/links/pager'
import { useListState } from '@/components/links/use-list-state'
import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { downloadFile } from '@/lib/download-file'
import { Download, ListPlus, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'

import {
   LIST_VIEWS,
   type ListView,
   type Member,
   type MemberStatus,
   isListView,
   memberStatuses,
} from '@/components/lists/types'

import { DetailDrawers } from '@/components/details/detail-drawers'
import { useDetailDrawer } from '@/components/details/use-detail-drawer'

import { trpc } from '../trpc'

type Confirm = { kind: 'member'; member: Member } | { kind: 'block'; member: Member } | { kind: 'list' }

const confirmText = (confirm: Confirm | null, listName: string) => {
   if (!confirm) return {
      title: '',
      description: '',
      action: '',
   }

   if (confirm.kind === 'list') {
      return {
         title: `Delete the list "${listName}"?`,
         description: 'Everyone in it is removed too. This cannot be undone.',
         action: 'Delete list',
      }
   }

   const name = confirm.member.name ?? confirm.member.slug

   return confirm.kind === 'block'
      ? {
           title: `Never contact ${name}?`,
           description:
              'They are removed from all your lists and can never be added again, by you or by a workflow.',
           action: 'Do not contact',
        }
      : {
           title: `Remove ${name} from this list?`,
           description: 'This cannot be undone.',
           action: 'Remove',
        }
}

export const Lists = () => {
   const utils = trpc.useUtils()
   const filters = useListState<MemberStatus>()
   const [chosenId, setChosenId] = useState<string>()
   const [tab, setTab] = useState<ListView>('ALL')
   const [label, setLabel] = useState('')
   const [naming, setNaming] = useState<'create' | 'rename' | null>(null)
   const [confirm, setConfirm] = useState<Confirm | null>(null)
   const [needsReview, setNeedsReview] = useState(false)
   const drawer = useDetailDrawer()

   const lists = trpc.workflowList.lists.useQuery(undefined, { retry: false })
   const current = lists.data?.find(list => list.id === chosenId) ?? lists.data?.[0]
   const listId = current?.id ?? ''
   const view = {
      state: tab === 'ALL' ? undefined : tab,
      label: label.trim().toLowerCase() || undefined,
   }

   const { search, status, page, pageSize } = filters.query
   const members = trpc.workflowList.members.useQuery(
      {
         listId,
         ...view,
         search,
         status,
         needsReview: needsReview || undefined,
         page,
         pageSize,
      },
      {
         enabled: Boolean(current),
         retry: false,
         placeholderData: previous => previous,
      }
   )

   const refresh = () => {
      void utils.workflowList.members.invalidate()
      void utils.workflowList.lists.invalidate()
   }

   const closeNaming = () => setNaming(null)
   const createList = trpc.workflowList.createList.useMutation({
      onSuccess: list => {
         setChosenId(list.id)
         closeNaming()
         refresh()
      },
   })
   const renameList = trpc.workflowList.renameList.useMutation({
      onSuccess: () => {
         closeNaming()
         refresh()
      },
   })
   const deleteList = trpc.workflowList.deleteList.useMutation({
      onSuccess: () => {
         setChosenId(undefined)
         refresh()
      },
   })
   const updateMember = trpc.workflowList.updateMember.useMutation({ onSuccess: refresh })
   const moveMember = trpc.workflowList.moveMember.useMutation({ onSuccess: refresh })
   const deleteMember = trpc.workflowList.deleteMember.useMutation({ onSuccess: refresh })
   const doNotContact = trpc.workflowList.doNotContact.useMutation({ onSuccess: refresh })
   const keepMember = trpc.workflowList.keepMember.useMutation({ onSuccess: refresh })
   const exportCsv = trpc.workflowList.exportCsv.useMutation({
      onSuccess: ({ fileName, csv }) => downloadFile(fileName, csv, 'text/csv;charset=utf-8'),
   })

   const memberActions = [updateMember, moveMember, deleteMember, doNotContact, keepMember]
   const busyId = memberActions.find(action => action.isPending)?.variables?.id
   const actionError = [...memberActions, deleteList, exportCsv].find(action => action.error)?.error?.message
   const text = confirmText(confirm, current?.name ?? '')

   const runConfirm = () => {
      if (confirm?.kind === 'list') {
         deleteList.mutate({ id: listId })
      } else if (confirm?.kind === 'block') {
         doNotContact.mutate({ id: confirm.member.id })
      } else if (confirm) {
         deleteMember.mutate({ id: confirm.member.id })
      }
   }

   return (
      <div className="grid w-full gap-4 px-4 lg:px-6">
         <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
               <h2 className="text-lg font-semibold">Lists</h2>
               <p className="text-muted-foreground text-sm">
                  The people you found, with why they were found. Work through them and set a status.
               </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
               {current ? (
                  <>
                     <Select
                        value={listId}
                        onValueChange={id => {
                           setChosenId(id)
                           filters.setPage(1)
                        }}
                     >
                        <SelectTrigger className="w-56" aria-label="Choose a list">
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           {lists.data?.map(list => (
                              <SelectItem key={list.id} value={list.id}>
                                 {list.name} ({list._count.members})
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                     <Button variant="ghost" size="icon" aria-label="Rename this list" onClick={() => setNaming('rename')}>
                        <Pencil />
                     </Button>
                     <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete this list"
                        onClick={() => setConfirm({ kind: 'list' })}
                     >
                        <Trash2 />
                     </Button>
                     <Button
                        variant="outline"
                        disabled={exportCsv.isPending}
                        onClick={() =>
                           exportCsv.mutate({
                              id: listId,
                              ...view,
                           })
                        }
                     >
                        <Download />
                        Export CSV
                     </Button>
                  </>
               ) : null}
               <Button variant="outline" onClick={() => setNaming('create')}>
                  <ListPlus />
                  New list
               </Button>
               {current ? <AddMemberDialog listId={listId} onAdded={refresh} /> : null}
            </div>
         </div>

         {lists.error ? <p className="text-destructive text-sm">{lists.error.message}</p> : null}
         {lists.data?.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
               You have no lists yet. Create one with New list.
            </p>
         ) : null}

         {current ? (
            <>
               <div className="flex flex-wrap items-center justify-between gap-2">
                  <Tabs
                     value={tab}
                     onValueChange={next => {
                        if (isListView(next)) {
                           setTab(next)
                           filters.setPage(1)
                        }
                     }}
                  >
                     <TabsList>
                        {Object.entries(LIST_VIEWS).map(([value, title]) => (
                           <TabsTrigger key={value} value={value}>
                              {title}
                           </TabsTrigger>
                        ))}
                     </TabsList>
                  </Tabs>
                  <Input
                     className="w-40"
                     aria-label="Only people with this label"
                     placeholder="Label"
                     maxLength={30}
                     value={label}
                     onChange={event => {
                        setLabel(event.target.value)
                        filters.setPage(1)
                     }}
                  />
                  <div className="flex items-center gap-2">
                     <Checkbox
                        id="needs-review"
                        checked={needsReview}
                        onCheckedChange={checked => {
                           setNeedsReview(checked === true)
                           filters.setPage(1)
                        }}
                     />
                     <Label htmlFor="needs-review">Needs review only</Label>
                  </div>
                  <ListToolbar
                     state={filters}
                     statuses={memberStatuses}
                     searchLabel="Search this list"
                     searchPlaceholder="Search name, headline or location"
                     archivable={false}
                  />
               </div>

               {actionError ? <p className="text-destructive text-sm">{actionError}</p> : null}

               <MembersTable
                  members={members.data?.items}
                  loading={members.isPending}
                  error={members.error?.message}
                  busyId={busyId}
                  otherLists={lists.data?.filter(list => list.id !== listId) ?? []}
                  onStatus={(member, next) =>
                     updateMember.mutate({
                        id: member.id,
                        status: next,
                     })
                  }
                  onState={(member, next) =>
                     updateMember.mutate({
                        id: member.id,
                        state: next,
                     })
                  }
                  onMove={(member, list) =>
                     moveMember.mutate({
                        id: member.id,
                        listId: list.id,
                     })
                  }
                  onDoNotContact={member =>
                     setConfirm({
                        kind: 'block',
                        member,
                     })
                  }
                  onDelete={member =>
                     setConfirm({
                        kind: 'member',
                        member,
                     })
                  }
                  onKeep={member => keepMember.mutate({ id: member.id })}
                  onOpen={member => drawer.show('person', member.slug)}
               />
               <DetailDrawers kind="person" order={members.data?.items.map(({ slug }) => slug) ?? []} />

               <Pager
                  total={members.data?.total ?? 0}
                  page={filters.page}
                  onPage={filters.setPage}
                  noun={['person', 'people']}
               />
            </>
         ) : null}

         <ListNameDialog
            open={naming !== null}
            title={naming === 'rename' ? 'Rename the list' : 'New list'}
            initial={naming === 'rename' ? (current?.name ?? '') : ''}
            pending={createList.isPending || renameList.isPending}
            error={naming === 'rename' ? renameList.error : createList.error}
            onSave={name =>
               naming === 'rename'
                  ? renameList.mutate({
                       id: listId,
                       name,
                    })
                  : createList.mutate({ name })
            }
            onClose={() => {
               createList.reset()
               renameList.reset()
               closeNaming()
            }}
         />

         <AlertDialog open={Boolean(confirm)} onOpenChange={open => (open ? undefined : setConfirm(null))}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>{text.title}</AlertDialogTitle>
                  <AlertDialogDescription>{text.description}</AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={runConfirm}>{text.action}</AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </div>
   )
}
