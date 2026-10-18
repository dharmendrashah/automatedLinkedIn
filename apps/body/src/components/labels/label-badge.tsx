import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

import { toneOf } from './labels'

type Props = {
   label: string
   // Clicking the label, such as to filter by it.
   onClick?: () => void
   clickLabel?: string
   onRemove?: () => void
}

export const LabelBadge = ({ label, onClick, clickLabel, onRemove }: Props) => {
   const body = <span className="truncate">{label}</span>

   return (
      <span className={cn('inline-flex max-w-48 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium', toneOf(label))}>
         {onClick ? (
            <button type="button" className="truncate hover:underline" aria-label={clickLabel} onClick={onClick}>
               {label}
            </button>
         ) : (
            body
         )}
         {onRemove ? (
            <button type="button" aria-label={`Remove ${label}`} onClick={onRemove}>
               <X className="size-3" />
            </button>
         ) : null}
      </span>
   )
}
