import { Skeleton } from '@/components/ui/skeleton'
import { TableCell, TableRow } from '@/components/ui/table'
import { type LucideIcon } from 'lucide-react'

type Props = {
   loading: boolean
   error: string | undefined
   empty: boolean
   columns: number
   emptyIcon: LucideIcon
   emptyText: string
}

// The rows a list table shows instead of data: loading, an error, or nothing found.
export const StateRows = ({ loading, error, empty, columns, emptyIcon: EmptyIcon, emptyText }: Props) => (
   <>
      {loading ? (
         <TableRow>
            <TableCell colSpan={columns}>
               <Skeleton className="h-8 w-full" />
            </TableCell>
         </TableRow>
      ) : null}
      {error ? (
         <TableRow>
            <TableCell colSpan={columns} className="text-destructive h-24 text-center text-sm">
               {error}
            </TableCell>
         </TableRow>
      ) : null}
      {empty ? (
         <TableRow>
            <TableCell colSpan={columns} className="text-muted-foreground h-24 text-center text-sm">
               <EmptyIcon className="mx-auto mb-2 size-5" />
               {emptyText}
            </TableCell>
         </TableRow>
      ) : null}
   </>
)
