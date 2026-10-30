import { NotesField } from '@/components/details/notes-field'
import { floatingDrawer } from '@/components/floating-drawer'
import { LabelCell } from '@/components/labels/label-cell'
import { PersonView } from '@/components/people/person-view'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { readableError } from '@/lib/trpc-error'
import { Ban, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { type Person } from './types'

import { trpc } from '../../trpc'
import { PANES, type Pane } from './address'
import { ChatPane } from './chat-pane'
import { HistoryPane } from './history-pane'
import { nextAfter, nextStepOf } from './rows'
import { type Ask } from './use-answer'
import { FIT_WORDS, STATUSES, foundByWord, isStatus, nameOf } from './words'

type Props = {
   id: string
   // The rows of the table, in order, for Previous and Next.
   order: string[]
   pane: Pane
   onPane: (pane: Pane) => void
   onMove: (id: string) => void
   onClose: () => void
   // The person is gone (erased): the drawer moves on, or closes on the last row.
   onGone: (next: string | null) => void
   onAnswer: (ask: Ask) => void
}

const useUpdate = () => {
   const utils = trpc.useUtils()

   return trpc.people.update.useMutation({
      onSuccess: () => utils.people.invalidate(),
      onError: error => toast.error(readableError(error)),
   })
}

const EraseButton = ({ person, onErased }: { person: Person; onErased: () => void }) => {
   const utils = trpc.useUtils()
   const name = nameOf(person)
   const erase = trpc.people.erase.useMutation({
      onSuccess: async () => {
         toast.success(`${name} was erased.`)
         onErased()
         await utils.people.invalidate()
      },
      onError: error => toast.error(readableError(error)),
   })

   return (
      <AlertDialog>
         <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-destructive" disabled={erase.isPending}>
               <Trash2 />
               Erase
            </Button>
         </AlertDialogTrigger>
         <AlertDialogContent>
            <AlertDialogHeader>
               <AlertDialogTitle>Erase {name}?</AlertDialogTitle>
               <AlertDialogDescription>
                  Everything stored about {name} is deleted for every client: requests, connections, conversations and
                  messages, lists, notes and profile reads. They are kept on Do not contact so they are not added again.
                  This cannot be undone.
               </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
               <AlertDialogCancel>Cancel</AlertDialogCancel>
               <AlertDialogAction onClick={() => erase.mutate({ id: person.id })}>Erase</AlertDialogAction>
            </AlertDialogFooter>
         </AlertDialogContent>
      </AlertDialog>
   )
}

// Name, reason, where they were found, fit, status, labels, the next step and Do not contact.
const Header = ({
   person,
   pane,
   onPane,
   onAnswer,
   onErased,
}: {
   person: Person
   pane: Pane
   onPane: (pane: Pane) => void
   onAnswer: (ask: Ask) => void
   onErased: () => void
}) => {
   const utils = trpc.useUtils()
   const update = useUpdate()
   const everywhere = trpc.people.doNotContactEverywhere.useMutation({
      onSuccess: async () => {
         toast.success(`${nameOf(person)} is on Do not contact for every client.`)
         await utils.people.invalidate()
      },
      onError: error => toast.error(readableError(error)),
   })
   const name = nameOf(person)
   const step = nextStepOf(person)
   const foundBy = person.foundBy.map(source => foundByWord(source, person.lists))
   // The Profile tab names the person itself.
   const Title = pane === 'profile' ? 'h2' : DrawerTitle

   return (
      <div className="grid gap-2">
         <div className="grid gap-0.5">
            <Title className="text-xl font-semibold">{name}</Title>
            {person.headline ? (
               <DrawerDescription className="text-foreground">{person.headline}</DrawerDescription>
            ) : null}
            {person.reasonText ? <p className="text-muted-foreground text-sm">{person.reasonText}</p> : null}
            {foundBy.length > 0 ? (
               <p className="text-muted-foreground text-sm">Also found by: {foundBy.join(', ')}</p>
            ) : null}
         </div>
         <div className="flex flex-wrap items-center gap-2">
            {person.fit === 'NONE' ? null : <Badge variant="secondary">{FIT_WORDS[person.fit]}</Badge>}
            {person.doNotContact ? <Badge variant="destructive">Do not contact</Badge> : null}
            <Select
               value={person.status}
               onValueChange={status =>
                  isStatus(status)
                     ? update.mutate({
                          id: person.id,
                          status,
                       })
                     : undefined
               }
            >
               <SelectTrigger size="sm" className="w-40" aria-label="Status">
                  <SelectValue />
               </SelectTrigger>
               <SelectContent>
                  {STATUSES.map(([status, word]) => (
                     <SelectItem key={status} value={status}>
                        {word}
                     </SelectItem>
                  ))}
               </SelectContent>
            </Select>
            <LabelCell
               tags={person.labels}
               kind="people"
               name={name}
               save={labels =>
                  update.mutateAsync({
                     id: person.id,
                     labels,
                  })
               }
            />
         </div>
         <div className="flex flex-wrap items-center gap-2">
            {step?.kind === 'REPLY' && pane !== 'chat' ? (
               <Button size="sm" onClick={() => onPane('chat')}>
                  Reply
               </Button>
            ) : null}
            {step?.kind === 'ACCEPT' ? (
               <>
                  <Button
                     size="sm"
                     onClick={() =>
                        onAnswer({
                           accountId: step.accountId,
                           requestId: step.requestId,
                           action: 'ACCEPT',
                           name,
                        })
                     }
                  >
                     Accept
                  </Button>
                  <Button
                     variant="outline"
                     size="sm"
                     onClick={() =>
                        onAnswer({
                           accountId: step.accountId,
                           requestId: step.requestId,
                           action: 'IGNORE',
                           name,
                        })
                     }
                  >
                     Ignore
                  </Button>
               </>
            ) : null}
            <Button
               variant="outline"
               size="sm"
               disabled={update.isPending}
               onClick={() =>
                  update.mutate({
                     id: person.id,
                     doNotContact: !person.doNotContact,
                  })
               }
            >
               <Ban />
               {person.doNotContact ? 'Allow contact again' : 'Do not contact'}
            </Button>
            <Button
               variant="ghost"
               size="sm"
               disabled={everywhere.isPending}
               onClick={() => everywhere.mutate({ id: person.id })}
            >
               Do not contact for all clients
            </Button>
            <EraseButton person={person} onErased={onErased} />
         </div>
         <NotesField
            key={person.id}
            id={`person-notes-${person.id}`}
            value={person.notes}
            placeholder="Anything to remember about them. Saved when you leave the field."
            onSave={notes =>
               update.mutate(
                  {
                     id: person.id,
                     notes: notes.trim() || null,
                  },
                  { onSuccess: () => toast.success('Notes saved.') }
               )
            }
         />
      </div>
   )
}

const Body = ({ id, order, pane, onPane, onMove, onGone, onAnswer }: Omit<Props, 'onClose'>) => {
   const person = trpc.people.get.useQuery({ id }, { retry: false })
   const index = order.indexOf(id)
   const previous = index > 0 ? order[index - 1] : undefined
   const next = index >= 0 ? order[index + 1] : undefined

   const moves = (
      <div className="flex items-center justify-end gap-1">
         <Button
            variant="ghost"
            size="icon"
            aria-label="Previous person"
            disabled={!previous}
            onClick={() => (previous ? onMove(previous) : undefined)}
         >
            <ChevronLeft />
         </Button>
         <span className="text-muted-foreground text-xs">{index >= 0 ? `${index + 1} of ${order.length}` : ''}</span>
         <Button
            variant="ghost"
            size="icon"
            aria-label="Next person"
            disabled={!next}
            onClick={() => (next ? onMove(next) : undefined)}
         >
            <ChevronRight />
         </Button>
      </div>
   )

   if (!person.data) {
      return (
         <div className="grid gap-3 p-4">
            {moves}
            <DrawerTitle className="text-muted-foreground text-sm font-normal">
               {person.error ? readableError(person.error) : 'Loading the person…'}
            </DrawerTitle>
         </div>
      )
   }

   return (
      <div className="grid content-start gap-4 overflow-y-auto p-4">
         {moves}
         <Header
            person={person.data}
            pane={pane}
            onPane={onPane}
            onAnswer={onAnswer}
            onErased={() => onGone(nextAfter(order, id))}
         />
         <Tabs value={pane} onValueChange={value => onPane(PANES.find(item => item === value) ?? 'chat')}>
            <TabsList>
               <TabsTrigger value="chat">Chat</TabsTrigger>
               <TabsTrigger value="profile">Profile</TabsTrigger>
               <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            <TabsContent value="chat">
               <ChatPane key={person.data.id} person={person.data} />
            </TabsContent>
            <TabsContent value="profile">
               <PersonView key={person.data.slug} slug={person.data.slug} clientId={person.data.clientId} confirmRead />
            </TabsContent>
            <TabsContent value="history">
               <HistoryPane person={person.data} />
            </TabsContent>
         </Tabs>
      </div>
   )
}

// One person of the client: who they are and why they are here, then the chat, the profile and the history.
export const PersonDrawer = ({ onClose, ...props }: Props) => (
   <Drawer direction="right" open onOpenChange={open => (open ? undefined : onClose())}>
      <DrawerContent className={floatingDrawer('sm:max-w-3xl')}>
         <Body {...props} />
      </DrawerContent>
   </Drawer>
)
