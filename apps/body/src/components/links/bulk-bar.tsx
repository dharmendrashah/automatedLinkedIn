import { Button } from '@/components/ui/button'
import { type ReactNode, useState } from 'react'
import { toast } from 'sonner'

import { LabelMultiSelect } from '../labels/label-multi-select'
import { type LabelKind, labelledNote } from '../labels/labels'
import { type Selection } from './use-selection'

export type LabelChange = { add?: string[]; remove?: string[] }

// The bar over a table while rows are picked: labels to add or remove, then whatever else the page offers.
export const BulkBar = ({
   count,
   kind,
   pending,
   onLabel,
   onClear,
   children,
}: {
   count: number
   kind: LabelKind
   pending: boolean
   onLabel: (change: LabelChange) => void
   onClear: () => void
   children?: ReactNode
}) => {
   const [labels, setLabels] = useState<string[]>([])
   const apply = (change: LabelChange) => {
      onLabel(change)
      setLabels([])
   }

   return (
      <div className="bg-muted/50 flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
         <span className="px-1 font-medium">{count} selected</span>
         <div className="w-64">
            <LabelMultiSelect
               id={`bulk-${kind}-labels`}
               kind={kind}
               value={labels}
               onChange={setLabels}
               placeholder="Pick labels"
            />
         </div>
         <Button
            size="sm"
            variant="outline"
            disabled={labels.length === 0 || pending}
            onClick={() => apply({ add: labels })}
         >
            Add labels
         </Button>
         <Button
            size="sm"
            variant="outline"
            disabled={labels.length === 0 || pending}
            onClick={() => apply({ remove: labels })}
         >
            Remove labels
         </Button>
         {children}
         <Button size="sm" variant="ghost" onClick={onClear}>
            Clear
         </Button>
      </div>
   )
}

type Mutation<I, O> = {
   mutate: (input: I, options?: { onSuccess?: (data: O) => void }) => void
   isPending: boolean
}

// The bulk bar of /profiles, /companies and /posts: labels, archive where the list has it, then the page's own actions.
export const LinkBulkBar = ({
   kind,
   selection,
   labelMany,
   archiveMany,
   children,
}: {
   kind: LabelKind
   selection: Selection
   labelMany: Mutation<{ ids: string[]; add: string[]; remove: string[] }, { changed: number; full: number }>
   archiveMany?: Mutation<{ ids: string[] }, { archived: number }>
   children?: ReactNode
}) => {
   const ids = [...selection.selected]

   if (ids.length === 0) {
      return null
   }

   return (
      <BulkBar
         count={ids.length}
         kind={kind}
         pending={labelMany.isPending}
         onLabel={({ add = [], remove = [] }) =>
            labelMany.mutate(
               {
                  ids,
                  add,
                  remove,
               },
               { onSuccess: result => toast.success(labelledNote(result)) }
            )
         }
         onClear={selection.clear}
      >
         {archiveMany ? (
            <Button
               size="sm"
               variant="outline"
               disabled={archiveMany.isPending}
               onClick={() =>
                  archiveMany.mutate(
                     { ids },
                     {
                        onSuccess: ({ archived }) => {
                           toast.success(`${archived} archived. Show archived brings them back.`)
                           selection.clear()
                        },
                     }
                  )
               }
            >
               Archive
            </Button>
         ) : null}
         {children}
      </BulkBar>
   )
}
