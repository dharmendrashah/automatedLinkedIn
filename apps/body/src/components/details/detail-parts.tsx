import { Button } from '@/components/ui/button'
import { DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Skeleton } from '@/components/ui/skeleton'
import { readableError } from '@/lib/trpc-error'
import { useMediaSource } from '@/lib/use-media-source'
import { FileSearch, Loader2, RefreshCw } from 'lucide-react'
import { type ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { isReading } from './read-status'

// Pieces every detail drawer shares: the cover and picture, the paid read button, loading and missing states.

const initialsOf = (name: string) =>
   name
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join('')

// A round photo for people, a rounded square logo for companies; initials when there is none or it does not load.
export const Picture = ({
   name,
   image,
   square = false,
   className,
}: {
   name: string
   image: string | null
   square?: boolean
   className?: string
}) => {
   const { src, onError } = useMediaSource(image)
   const shape = cn('bg-muted size-24 border-4 border-background', square ? 'rounded-xl' : 'rounded-full')

   return src ? (
      <img
         src={src}
         alt=""
         referrerPolicy="no-referrer"
         className={cn(shape, 'object-cover', className)}
         onError={onError}
      />
   ) : (
      <span className={cn(shape, 'text-muted-foreground grid place-items-center text-2xl font-semibold', className)}>
         {initialsOf(name)}
      </span>
   )
}

// The top card with a cover strip, like a LinkedIn page: the person's own cover when there is one and it loads.
export const Cover = ({ children, image = null }: { children: ReactNode; image?: string | null }) => {
   const { src, onError } = useMediaSource(image)

   return (
      <div className="overflow-hidden rounded-xl border">
         {src ? (
            <img
               src={src}
               alt=""
               referrerPolicy="no-referrer"
               onError={onError}
               className="bg-muted aspect-[4/1] max-h-48 w-full object-cover"
            />
         ) : (
            <div className="from-primary/30 to-primary/5 h-20 bg-gradient-to-r" />
         )}
         <div className="-mt-12 grid gap-3 px-4 pb-4">{children}</div>
      </div>
   )
}

type ReadProps = {
   what: string
   readAt: string | null
   // The newest read the worker has for this item.
   read: { status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED'; message: string | null } | null
   pending: boolean
   error: { message: string } | null
   onRead: () => void
}

// The read: "Reading…" while the worker has it, when it was last read, and why it did not work. The cost is accepted, so it is
// not shown.
export const ReadButton = ({ what, readAt, read, pending, error, onRead }: ReadProps) => {
   const reading = isReading(read)

   return (
      <>
         <Button variant="outline" size="sm" disabled={pending || reading} onClick={onRead}>
            {pending || reading ? <Loader2 className="animate-spin" /> : readAt ? <RefreshCw /> : <FileSearch />}
            {reading ? `Reading the ${what}…` : readAt ? 'Read again' : `Read ${what}`}
         </Button>
         {reading ? (
            <p className="text-muted-foreground basis-full text-xs">
               This can take a few minutes. You can close this and come back.
            </p>
         ) : readAt ? (
            <p className="text-muted-foreground basis-full text-xs">Read {new Date(readAt).toLocaleDateString()}.</p>
         ) : null}
         {read?.status === 'FAILED' && read.message ? (
            <p className="text-destructive basis-full text-sm">{read.message}</p>
         ) : null}
         {error ? <p className="text-destructive basis-full text-sm">{readableError(error)}</p> : null}
      </>
   )
}

export const DetailLoading = ({ what }: { what: string }) => (
   <div className="grid gap-3">
      <DrawerTitle className="sr-only">Loading the {what}</DrawerTitle>
      <Skeleton className="h-56 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
   </div>
)

export const DetailMissing = ({ error }: { error: { message: string } }) => (
   <DrawerHeader className="p-0">
      <DrawerTitle>No longer here</DrawerTitle>
      <DrawerDescription>{readableError(error)}</DrawerDescription>
   </DrawerHeader>
)

// A person row inside a company or post drawer; opens their own drawer.
export const PersonRow = ({ name, lines, onOpen }: { name: string; lines: (string | null)[]; onOpen: () => void }) => (
   <li>
      <button type="button" onClick={onOpen} className="hover:bg-muted grid w-full gap-0.5 rounded-md p-2 text-left">
         <span className="text-sm font-medium">{name}</span>
         {lines.filter(Boolean).map(line => (
            <span key={line} className="text-muted-foreground text-xs">
               {line}
            </span>
         ))}
      </button>
   </li>
)
