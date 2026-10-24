import { Photo } from '@/components/photo'

import { cn } from '@/lib/utils'

import { initialsOf } from '../unibox/colors'

type Props = {
   name: string
   imageUrl?: string
   // A person is round, a company or a school square.
   shape?: 'round' | 'square'
   // The size and text size, as classes: "size-10 text-sm".
   className?: string
}

// A person's or a company's picture over its initials. Decorative: the name is always written next to it.
export const Mark = ({ name, imageUrl, shape = 'round', className }: Props) => {
   const cut = shape === 'round' ? 'rounded-full' : 'rounded-md'

   return (
      <span
         aria-hidden
         className={cn(
            'bg-muted text-muted-foreground relative inline-flex shrink-0 items-center justify-center font-semibold select-none',
            cut,
            className
         )}
      >
         {initialsOf(name)}
         <Photo url={imageUrl} className={cut} />
      </span>
   )
}
