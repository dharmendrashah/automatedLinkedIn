import { IcpDialog } from '@/components/icps/icp-dialog'
import { IcpPreviewDialog } from '@/components/icps/icp-preview-dialog'
import { StateRows } from '@/components/links/state-rows'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FlaskConical, Pencil, Plus, Target, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { type Icp, seniorityOptions } from '@/components/icps/icp-form'

import { trpc } from '../trpc'

const COLUMNS = 3

const summary = (icp: Icp) =>
   [
      icp.includeTitles.join(', '),
      seniorityOptions
         .filter(({ level }) => icp.seniorities.includes(level))
         .map(({ label }) => label)
         .join(', '),
      icp.locations.join(', '),
   ]
      .filter(Boolean)
      .join(' · ')

export const Icps = () => {
   const utils = trpc.useUtils()
   const [editing, setEditing] = useState<{ icp: Icp | null } | null>(null)
   const [previewing, setPreviewing] = useState<Icp | null>(null)
   const [deleting, setDeleting] = useState<Icp | null>(null)

   const list = trpc.icp.list.useQuery(undefined, { retry: false })
   const remove = trpc.icp.delete.useMutation({ onSuccess: () => void utils.icp.list.invalidate() })

   return (
      <div className="grid w-full gap-4 px-4 lg:px-6">
         <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
               <h2 className="text-lg font-semibold">Ideal customers</h2>
               <p className="text-muted-foreground text-sm">
                  Describe who you want to find once. Every person is scored against it.
               </p>
            </div>
            <Button onClick={() => setEditing({ icp: null })}>
               <Plus />
               New ideal customer
            </Button>
         </div>

         {remove.error ? <p className="text-destructive text-sm">{remove.error.message}</p> : null}

         <div className="overflow-hidden rounded-lg border">
            <Table>
               <TableHeader className="bg-muted/50">
                  <TableRow>
                     <TableHead>Name</TableHead>
                     <TableHead>Looks for</TableHead>
                     <TableHead className="w-32" />
                  </TableRow>
               </TableHeader>
               <TableBody>
                  <StateRows
                     loading={list.isPending}
                     error={list.error?.message}
                     empty={list.data?.length === 0}
                     columns={COLUMNS}
                     emptyIcon={Target}
                     emptyText="No ideal customers yet. Use New ideal customer to describe one."
                  />
                  {list.data?.map(icp => (
                     <TableRow key={icp.id}>
                        <TableCell className="font-medium">{icp.name}</TableCell>
                        <TableCell className="text-muted-foreground">{summary(icp) || 'No rules yet'}</TableCell>
                        <TableCell>
                           <div className="flex items-center justify-end gap-1">
                              <Button
                                 variant="ghost"
                                 size="icon"
                                 aria-label={`Try ${icp.name}`}
                                 onClick={() => setPreviewing(icp)}
                              >
                                 <FlaskConical />
                              </Button>
                              <Button
                                 variant="ghost"
                                 size="icon"
                                 aria-label={`Edit ${icp.name}`}
                                 onClick={() => setEditing({ icp })}
                              >
                                 <Pencil />
                              </Button>
                              <Button
                                 variant="ghost"
                                 size="icon"
                                 aria-label={`Delete ${icp.name}`}
                                 disabled={remove.isPending}
                                 onClick={() => setDeleting(icp)}
                              >
                                 <Trash2 />
                              </Button>
                           </div>
                        </TableCell>
                     </TableRow>
                  ))}
               </TableBody>
            </Table>
         </div>

         <IcpDialog open={Boolean(editing)} icp={editing?.icp ?? null} onClose={() => setEditing(null)} />
         <IcpPreviewDialog icp={previewing} onClose={() => setPreviewing(null)} />

         <AlertDialog open={Boolean(deleting)} onOpenChange={open => (open ? undefined : setDeleting(null))}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
                  <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleting && remove.mutate({ id: deleting.id })}>
                     Delete
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </div>
   )
}
