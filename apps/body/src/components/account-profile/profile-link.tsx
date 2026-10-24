import { type ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { linkedInHref } from './safe-link'

type Props = {
   href: string | undefined
   className?: string
   children: ReactNode
}

// A name that links to LinkedIn when its address is one (https on linkedin.com), and is plain text when it is not.
export const ProfileLink = ({ href, className, children }: Props) => {
   const safe = linkedInHref(href)

   return safe ? (
      <a href={safe} target="_blank" rel="noopener noreferrer" className={cn('hover:underline', className)}>
         {children}
      </a>
   ) : (
      <span className={className}>{children}</span>
   )
}
