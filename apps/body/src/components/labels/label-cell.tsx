import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { readableError } from '@/lib/trpc-error'
import { Loader2, Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { LabelBadge } from './label-badge'
import { LabelOptions } from './label-multi-select'
import { type LabelKind } from './labels'

type Props = {
   tags: string[]
   kind: LabelKind
   // Who the labels belong to, for screen readers.
   name: string
   // Saves the row's full label list; resolves once the table shows it.
   save: (tags: string[]) => Promise<unknown>
   // Clicking a label, such as to filter the table by it.
   onFilter?: (tag: string) => void
}

// A row's labels, changed in place: x removes one, + opens every label to tick. Shows the change at once and goes back
// to the saved labels if saving fails. One save at a time per row; the latest change waits for the one in flight.
export const LabelCell = ({ tags, kind, name, save, onFilter }: Props) => {
   const [draft, setDraft] = useState<string[] | null>(null)
   const [saving, setSaving] = useState(false)
   const next = useRef<string[] | null>(null)
   const shown = draft ?? tags

   const send = async (labels: string[]) => {
      setSaving(true)

      try {
         await save(labels)
      } catch (error) {
         next.current = null
         toast.error(`Labels of ${name} were not saved: ${error instanceof Error ? readableError(error) : 'please try again.'}`)
      }

      const queued = next.current

      next.current = null

      if (queued) {
         await send(queued)
      } else {
         setSaving(false)
         setDraft(null)
      }
   }

   const change = (labels: string[]) => {
      setDraft(labels)

      if (saving) {
         next.current = labels
      } else {
         void send(labels)
      }
   }

   return (
      <span className="flex flex-wrap items-center gap-1">
         {shown.map(tag => (
            <LabelBadge
               key={tag}
               label={tag}
               clickLabel={onFilter ? `Show only ${tag}` : undefined}
               onClick={onFilter ? () => onFilter(tag) : undefined}
               onRemove={() => change(shown.filter(item => item !== tag))}
            />
         ))}
         <Popover>
            <PopoverTrigger asChild>
               <Button variant="ghost" size="icon" className="size-6" aria-label={`Edit the labels of ${name}`}>
                  {saving ? <Loader2 className="animate-spin" /> : <Plus />}
               </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="start">
               <LabelOptions value={shown} onChange={change} kind={kind} />
            </PopoverContent>
         </Popover>
      </span>
   )
}
