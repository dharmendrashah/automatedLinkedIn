import { Button } from '@/components/ui/button'

import { PAGE_SIZE } from './use-list-state'

type Props = {
   total: number
   page: number
   onPage: (page: number) => void
   // What the list holds, singular and plural, such as "profile" and "profiles".
   noun: [string, string]
}

export const Pager = ({ total, page, onPage, noun }: Props) => {
   const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

   return (
      <div className="flex items-center justify-between text-sm">
         <p className="text-muted-foreground">
            {total} {noun[total === 1 ? 0 : 1]}
         </p>
         <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
               Page {page} of {pages}
            </span>
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
               Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
               Next
            </Button>
         </div>
      </div>
   )
}
