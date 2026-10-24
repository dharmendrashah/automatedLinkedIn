import { Photo } from '@/components/photo'
import { type CSSProperties } from 'react'

import { cn } from '@/lib/utils'

import { type UniboxAccount } from './types'

import { stateLabel } from './account-state'
import { hueOf, initialsOf } from './colors'

const SIZES = {
   xs: 'size-4 text-[8px]',
   sm: 'size-6 text-[10px]',
   md: 'size-8 text-xs',
   lg: 'size-10 text-sm',
} as const

type Props = {
   account: UniboxAccount | undefined
   size?: keyof typeof SIZES
   className?: string
}

// An account: its initials on its own colour, with a dot when it cannot send. The colour only helps the eye; the name is always
// shown next to it.
export const AccountAvatar = ({ account, size = 'md', className }: Props) => (
   <span
      role="img"
      aria-label={account ? `${account.name}, ${stateLabel(account.state)}` : 'Unknown account'}
      style={{ '--h': account ? hueOf(account.id) : 0 } as CSSProperties}
      className={cn(
         'relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none',
         'bg-[oklch(0.92_0.06_var(--h))] text-[oklch(0.38_0.12_var(--h))] dark:bg-[oklch(0.34_0.07_var(--h))] dark:text-[oklch(0.88_0.08_var(--h))]',
         SIZES[size],
         className
      )}
   >
      {account ? initialsOf(account.name) : '?'}
      <Photo url={account?.imageUrl} />
      {account && account.state !== 'ACTIVE' ? (
         <span
            aria-hidden
            className={cn(
               'absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-card',
               account.state === 'PAUSED' ? 'bg-warning' : 'bg-destructive'
            )}
         />
      ) : null}
   </span>
)

// A person outside the app: initials on a neutral colour.
export const ContactAvatar = ({
   name,
   imageUrl,
   size = 'md',
   className,
}: {
   name: string
   imageUrl?: string
   size?: keyof typeof SIZES
   className?: string
}) => (
   <span
      role="img"
      aria-label={name}
      className={cn(
         'relative inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground select-none',
         SIZES[size],
         className
      )}
   >
      {initialsOf(name)}
      <Photo url={imageUrl} />
   </span>
)

type PairProps = {
   contact: string
   contactImage?: string
   account: UniboxAccount | undefined
   // Whose message it is: THEM came from the contact to the account, ME went from the account to the contact.
   direction: 'ME' | 'THEM'
   className?: string
}

// The small preview of a message's two ends: the contact's avatar with the account's on its corner, and which way it went.
export const AvatarPair = ({ contact, contactImage, account, direction, className }: PairProps) => (
   <span
      role="img"
      aria-label={
         direction === 'THEM'
            ? `From ${contact} to ${account?.name ?? 'an account'}`
            : `From ${account?.name ?? 'an account'} to ${contact}`
      }
      className={cn('relative inline-flex size-11 shrink-0', className)}
   >
      <ContactAvatar name={contact} imageUrl={contactImage} size="lg" className="absolute top-0 left-0" />
      <AccountAvatar account={account} size="sm" className="absolute -right-0.5 -bottom-0.5 ring-2 ring-card" />
   </span>
)
