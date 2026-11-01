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

import { type ReadNoun, isRecent, readCostLine } from './read-cost'

type Props = {
   noun: ReadNoun
   // What a read fills in, shown before the price.
   fills: string
   picked: Array<{ id: string; readAt: Date | string | null }>
   pending: boolean
   onRead: (ids: string[]) => void
}

// The bulk bar's Read for the picked companies or posts: the price first, then one paid read each.
export const ReadManyButton = ({ noun, fills, picked, pending, onRead }: Props) => {
   const recent = picked.filter(({ readAt }) => isRecent(readAt)).length

   return (
      <AlertDialog>
         <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={picked.length === 0 || pending}>
               Read
            </Button>
         </AlertDialogTrigger>
         <AlertDialogContent>
            <AlertDialogHeader>
               <AlertDialogTitle>Read the details of the picked {noun.many}?</AlertDialogTitle>
               <AlertDialogDescription>
                  {fills} {readCostLine(noun, picked.length - recent, recent)}
               </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
               <AlertDialogCancel>Cancel</AlertDialogCancel>
               <AlertDialogAction
                  disabled={picked.length === recent}
                  onClick={() => onRead(picked.map(({ id }) => id))}
               >
                  Read
               </AlertDialogAction>
            </AlertDialogFooter>
         </AlertDialogContent>
      </AlertDialog>
   )
}
