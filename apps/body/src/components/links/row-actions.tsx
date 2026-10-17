import { Button } from '@/components/ui/button'
import { Archive, ArchiveRestore, Loader2, Pencil } from 'lucide-react'

type Props = {
   // What the buttons are for, used in their labels.
   name: string
   archived: boolean
   busy: boolean
   // Left out when the row has nothing to edit.
   onEdit?: () => void
   onArchive: () => void
   onRestore: () => void
}

export const RowActions = ({ name, archived, busy, onEdit, onArchive, onRestore }: Props) => (
   <div className="flex items-center justify-end gap-1">
      {onEdit ? (
         <Button variant="ghost" size="icon" aria-label={`Edit ${name}`} onClick={onEdit}>
            <Pencil />
         </Button>
      ) : null}
      <Button
         variant="ghost"
         size="icon"
         disabled={busy}
         aria-label={`${archived ? 'Restore' : 'Archive'} ${name}`}
         onClick={archived ? onRestore : onArchive}
      >
         {busy ? <Loader2 className="animate-spin" /> : archived ? <ArchiveRestore /> : <Archive />}
      </Button>
   </div>
)
