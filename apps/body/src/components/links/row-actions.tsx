import { Button } from '@/components/ui/button'
import { Archive, ArchiveRestore, Eye, Loader2, Pencil } from 'lucide-react'

type Props = {
   // What the buttons are for, used in their labels.
   name: string
   archived: boolean
   busy: boolean
   // Left out when the row has nothing to edit.
   onEdit?: () => void
   // Left out when the row has nothing to view; an archived row never shows it.
   onView?: () => void
   onArchive: () => void
   onRestore: () => void
}

export const RowActions = ({ name, archived, busy, onEdit, onView, onArchive, onRestore }: Props) => (
   <div className="flex items-center justify-end gap-1">
      {onView && !archived ? (
         <Button variant="ghost" size="icon" aria-label={`View the profile of ${name}`} onClick={onView}>
            <Eye />
         </Button>
      ) : null}
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
