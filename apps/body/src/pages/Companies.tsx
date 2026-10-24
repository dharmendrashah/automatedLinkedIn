import { AddCompaniesDialog } from '@/components/companies/add-companies-dialog'
import { CompaniesTable } from '@/components/companies/companies-table'
import { EditCompanyDialog } from '@/components/companies/edit-company-dialog'
import { DetailDrawers } from '@/components/details/detail-drawers'
import { useDetailDrawer } from '@/components/details/use-detail-drawer'
import { ListToolbar } from '@/components/links/list-toolbar'
import { LinkBulkBar } from '@/components/links/bulk-bar'
import { linkStatuses } from '@/components/links/link-statuses'
import { Pager } from '@/components/links/pager'
import { useSelection } from '@/components/links/use-selection'
import { useListState } from '@/components/links/use-list-state'
import { ViewPageDialog } from '@/components/links/view-page-dialog'
import { Button } from '@/components/ui/button'
import { Eye } from 'lucide-react'
import { useState } from 'react'

import { type Company } from '@/components/companies/types'

import { trpc } from '../trpc'

export const Companies = () => {
   const utils = trpc.useUtils()
   const state = useListState()
   const selection = useSelection()
   const [toEdit, setToEdit] = useState<Company | null>(null)
   // The company an account is asked to view; `null` inside means a pasted link.
   const [viewing, setViewing] = useState<{ company: Company | null } | null>(null)
   const drawer = useDetailDrawer()

   const list = trpc.linkedInCompany.list.useQuery(state.query, {
      retry: false,
      placeholderData: previous => previous,
   })

   const refresh = () => {
      void utils.linkedInCompany.list.invalidate()
      void utils.label.list.invalidate()
   }
   const archive = trpc.linkedInCompany.archive.useMutation({ onSuccess: refresh })
   const restore = trpc.linkedInCompany.restore.useMutation({ onSuccess: refresh })
   const labelMany = trpc.linkedInCompany.labelMany.useMutation({ onSuccess: refresh })
   const archiveMany = trpc.linkedInCompany.archiveMany.useMutation({ onSuccess: refresh })
   const update = trpc.linkedInCompany.update.useMutation()
   const saveTags = async (company: Company, tags: string[]) => {
      await update.mutateAsync({
         id: company.id,
         tags,
      })
      await Promise.all([utils.linkedInCompany.list.invalidate(), utils.label.list.invalidate()])
   }

   const busyId = archive.isPending ? archive.variables?.id : restore.isPending ? restore.variables?.id : undefined
   const actionError = [archive, restore, labelMany, archiveMany].find(action => action.error)?.error?.message

   return (
      <div className="grid w-full gap-4 px-4 lg:px-6">
         <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
               <h2 className="text-lg font-semibold">LinkedIn companies</h2>
               <p className="text-muted-foreground text-sm">
                  The companies you want to reach. Paste their links to add them.
               </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
               <Button variant="outline" onClick={() => setViewing({ company: null })}>
                  <Eye />
                  View a company
               </Button>
               <AddCompaniesDialog />
            </div>
         </div>

         <ListToolbar
            state={state}
            statuses={linkStatuses}
            kind="companies"
            searchLabel="Search companies"
            searchPlaceholder="Search name, industry or link"
         />

         {actionError ? <p className="text-destructive text-sm">{actionError}</p> : null}

         <LinkBulkBar kind="companies" selection={selection} labelMany={labelMany} archiveMany={archiveMany} />

         <CompaniesTable
            companies={list.data?.items}
            loading={list.isPending}
            error={list.error?.message}
            busyId={busyId}
            onEdit={setToEdit}
            onView={company => setViewing({ company })}
            onArchive={company => archive.mutate({ id: company.id })}
            onRestore={company => restore.mutate({ id: company.id })}
            onTag={state.addTag}
            saveTags={saveTags}
            onOpen={company => drawer.show('company', company.slug)}
            selection={selection}
         />

         <Pager
            total={list.data?.total ?? 0}
            page={state.page}
            onPage={state.setPage}
            noun={['company', 'companies']}
         />

         <EditCompanyDialog company={toEdit} onClose={() => setToEdit(null)} />
         {viewing ? (
            <ViewPageDialog
               key={viewing.company?.id ?? 'link'}
               kind="COMPANY"
               saved={viewing.company ? { id: viewing.company.id, name: viewing.company.name ?? viewing.company.slug } : null}
               onClose={() => setViewing(null)}
            />
         ) : null}
         <DetailDrawers kind="company" order={list.data?.items.map(({ slug }) => slug) ?? []} />
      </div>
   )
}
