import { Button } from '@/components/ui/button'
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog'
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { readableError } from '@/lib/trpc-error'
import { Bookmark, Save, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'

import { trpc } from '../../trpc'

type Props = {
   // The page's address query a view keeps (filters, sort, labels and pickers), and the one to go back to.
   query: string
   onApply: (query: string) => void
}

// Named sets of filters the owner saved, such as one per client; saving a name that exists replaces it.
export const ViewsMenu = ({ query, onApply }: Props) => {
   const utils = trpc.useUtils()
   const views = trpc.linkedInCompany.views.useQuery(undefined, { retry: false })
   const refresh = () => void utils.linkedInCompany.views.invalidate()
   const save = trpc.linkedInCompany.saveView.useMutation({ onSuccess: refresh })
   const remove = trpc.linkedInCompany.removeView.useMutation({ onSuccess: refresh })
   const [naming, setNaming] = useState(false)
   const [name, setName] = useState('')
   const id = useId()
   const current = views.data?.find(view => view.query === query)

   const submit = () =>
      save.mutate(
         {
            name: name.trim(),
            query,
         },
         { onSuccess: () => setNaming(false) }
      )

   return (
      <>
         <DropdownMenu>
            <DropdownMenuTrigger asChild>
               <Button variant="outline">
                  <Bookmark />
                  {current ? current.name : 'Views'}
               </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
               <DropdownMenuLabel>Saved views</DropdownMenuLabel>
               {views.data?.length ? null : (
                  <p className="text-muted-foreground px-2 py-1.5 text-xs">None yet. Save the filters you use often.</p>
               )}
               {views.data?.map(view => (
                  <DropdownMenuItem key={view.id} onSelect={() => onApply(view.query)} className="justify-between">
                     <span className="truncate">{view.name}</span>
                     <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive rounded p-0.5"
                        aria-label={`Delete the view ${view.name}`}
                        onClick={event => {
                           event.stopPropagation()
                           remove.mutate({ id: view.id })
                        }}
                     >
                        <Trash2 className="size-3.5" />
                     </button>
                  </DropdownMenuItem>
               ))}
               <DropdownMenuSeparator />
               <DropdownMenuItem
                  onSelect={() => {
                     setName(current?.name ?? '')
                     setNaming(true)
                  }}
               >
                  <Save />
                  Save the current filters…
               </DropdownMenuItem>
            </DropdownMenuContent>
         </DropdownMenu>
         <Dialog open={naming} onOpenChange={setNaming}>
            <DialogContent className="sm:max-w-sm">
               <DialogHeader>
                  <DialogTitle>Save view</DialogTitle>
                  <DialogDescription>
                     A view keeps the filters, labels and order. Using a name you already have replaces that view.
                  </DialogDescription>
               </DialogHeader>
               <form
                  className="grid gap-3"
                  onSubmit={event => {
                     event.preventDefault()
                     submit()
                  }}
               >
                  <Input
                     id={id}
                     aria-label="View name"
                     placeholder="Acme – EU MSPs"
                     maxLength={80}
                     value={name}
                     onChange={event => setName(event.target.value)}
                  />
                  {save.error ? <p className="text-destructive text-sm">{readableError(save.error)}</p> : null}
                  <DialogFooter>
                     <Button type="submit" disabled={!name.trim() || save.isPending}>
                        Save
                     </Button>
                  </DialogFooter>
               </form>
            </DialogContent>
         </Dialog>
         {remove.error ? <span className="text-destructive text-xs">{readableError(remove.error)}</span> : null}
      </>
   )
}
