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
import { Button } from '@/components/ui/button'
import { readableError } from '@/lib/trpc-error'
import { toast } from 'sonner'

import { type Company } from './types'

import { trpc } from '../../trpc'
import { isRecent, readCostLine, readResultLine } from './read-cost'

// The bulk bar's Read for the picked companies (.plan/companies-import-csv.md): the price first, then one paid read each.
export const ReadManyButton = ({ picked }: { picked: Company[] }) => {
   const utils = trpc.useUtils()
   const readMany = trpc.linkedInCompany.readMany.useMutation({
      onSuccess: totals => {
         toast.success(readResultLine(totals))
         void utils.linkedInCompany.list.invalidate()
      },
      onError: error => toast.error(readableError(error)),
   })
   const live = picked.filter(({ archivedAt }) => !archivedAt)
   const recent = live.filter(({ readAt }) => isRecent(readAt)).length

   return (
      <AlertDialog>
         <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={live.length === 0 || readMany.isPending}>
               Read
            </Button>
         </AlertDialogTrigger>
         <AlertDialogContent>
            <AlertDialogHeader>
               <AlertDialogTitle>Read the details of the picked companies?</AlertDialogTitle>
               <AlertDialogDescription>
                  Fills name, logo, industry, size, website and country. {readCostLine(live.length - recent, recent)}
               </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
               <AlertDialogCancel>Cancel</AlertDialogCancel>
               <AlertDialogAction
                  disabled={live.length === recent}
                  onClick={() => readMany.mutate({ ids: live.map(({ id }) => id) })}
               >
                  Read
               </AlertDialogAction>
            </AlertDialogFooter>
         </AlertDialogContent>
      </AlertDialog>
   )
}
