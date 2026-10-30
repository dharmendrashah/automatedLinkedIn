import { useMediaSource } from '@/lib/use-media-source'

import { cn } from '@/lib/utils'

type Props = {
   url: string | undefined
   // The shape it is cut to; the picture fills its parent, which holds the initials under it.
   className?: string
}

// A picture over the initials: the initials show while it loads, and stay when it cannot be loaded (an address that expired).
// Only https addresses are used, loaded through the file cache, and the page that shows it is never named to the image host.
export const Photo = ({ url, className = 'rounded-full' }: Props) => {
   const { src, onError } = useMediaSource(url?.startsWith('https://') ? url : undefined)

   if (!src) {
      return null
   }

   return (
      <img
         src={src}
         alt=""
         loading="lazy"
         referrerPolicy="no-referrer"
         onError={onError}
         className={cn('absolute inset-0 size-full object-cover', className)}
      />
   )
}
