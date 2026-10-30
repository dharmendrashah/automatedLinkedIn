import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
   AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { readableError } from '@/lib/trpc-error'
import { toast } from 'sonner'

import { type Person } from './types'

import { trpc } from '../../trpc'
import { LINK_WORDS, nameOf } from './words'

type Link = Person['links'][number]

const accountOf = ({ account }: Link) => account?.displayName ?? account?.email ?? ''

// Removing a connection is done on LinkedIn by the account, once, after the owner confirms it by name.
const RemoveConnection = ({ link, accountId, name }: { link: Link; accountId: string; name: string }) => {
   const utils = trpc.useUtils()
   const remove = trpc.connections.remove.useMutation({
      onSuccess: async () => {
         toast.success(`Removing ${name} is on its way to LinkedIn.`)
         await utils.people.invalidate()
      },
      onError: error => toast.error(readableError(error)),
   })

   return (
      <AlertDialog>
         <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" disabled={remove.isPending}>
               Remove
            </Button>
         </AlertDialogTrigger>
         <AlertDialogContent>
            <AlertDialogHeader>
               <AlertDialogTitle>Remove {name} from your connections?</AlertDialogTitle>
               <AlertDialogDescription>
                  {accountOf(link)} stops being connected to {name} on LinkedIn. This cannot be undone here.
               </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
               <AlertDialogCancel>Cancel</AlertDialogCancel>
               <AlertDialogAction
                  onClick={() =>
                     remove.mutate({
                        accountId,
                        id: link.sourceId,
                     })
                  }
               >
                  Remove
               </AlertDialogAction>
            </AlertDialogFooter>
         </AlertDialogContent>
      </AlertDialog>
   )
}

// The History tab: every way the client's accounts know the person, newest first.
export const HistoryPane = ({ person }: { person: Person }) =>
   person.links.length > 0 ? (
      <ul className="divide-y rounded-xl border text-sm">
         {person.links.map(link => (
            <li key={`${link.kind}-${link.sourceId}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
               <span className="font-medium">{LINK_WORDS[link.kind] ?? link.kind}</span>
               <span className="text-muted-foreground">{accountOf(link)}</span>
               <span className="text-muted-foreground ml-auto">{new Date(link.at).toLocaleDateString()}</span>
               {link.kind === 'CONNECTION' && link.accountId ? (
                  <RemoveConnection link={link} accountId={link.accountId} name={nameOf(person)} />
               ) : null}
            </li>
         ))}
      </ul>
   ) : (
      <p className="text-muted-foreground text-sm">Nothing yet.</p>
   )
