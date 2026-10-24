import { useState } from 'react'

import { cn } from '@/lib/utils'

type Props = {
   url: string | undefined
   // The shape it is cut to; the picture fills its parent, which holds the initials under it.
   className?: string
}

// A picture over the initials: the initials show while it loads, and stay when it cannot be loaded (an address that expired).
// Only https addresses are used, and the page that shows it is never named to the image host.
export const Photo = ({ url, className = 'rounded-full' }: Props) => {
   const [failed, setFailed] = useState<string>()

   if (!url?.startsWith('https://') || failed === url) {
      return null
   }

   return (
      <img
         src={url}
         alt=""
         loading="lazy"
         referrerPolicy="no-referrer"
         onError={() => setFailed(url)}
         className={cn('absolute inset-0 size-full object-cover', className)}
      />
   )
}
