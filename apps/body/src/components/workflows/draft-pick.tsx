import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import { trpc } from '../../trpc'
import { summaryOf } from '../posting/summary'

// One of the owner's saved drafts of the Posting page, shown by its first words.
export const DraftPick = ({
   id,
   value,
   onChange,
}: {
   id: string
   value: string
   onChange: (next: string) => void
}) => {
   const drafts = trpc.postDraft.list.useQuery(undefined, { retry: false })

   if (drafts.isPending) {
      return <p className="text-muted-foreground text-sm">Loading drafts</p>
   }

   const items = drafts.data?.items ?? []

   if (items.length === 0) {
      return <p className="text-muted-foreground text-sm">Save a draft on the Posting page first.</p>
   }

   return (
      <Select value={value || undefined} onValueChange={onChange}>
         <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder="Pick a draft" />
         </SelectTrigger>
         <SelectContent>
            {items.map(draft => (
               <SelectItem key={draft.id} value={draft.id}>
                  {summaryOf(draft.blocks).words}
               </SelectItem>
            ))}
         </SelectContent>
      </Select>
   )
}
