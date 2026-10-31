import { NotesField } from '@/components/details/notes-field'
import { ErrorBoundary } from '@/components/error-boundary'
import { WIDE, floatingDrawer } from '@/components/floating-drawer'
import { LabelCell } from '@/components/labels/label-cell'
import { ProfileCard, ProfileDetails } from '@/components/people/person-view'
import { usePersonDetail } from '@/components/people/use-person-detail'
import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
   CodeBlock,
   CodeBlockActions,
   CodeBlockContent,
   CodeBlockCopyButton,
   CodeBlockHeader,
   CodeBlockTitle,
} from '@/components/ui/code-block'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { readableError } from '@/lib/trpc-error'
import {
   Ban,
   Braces,
   ChevronLeft,
   ChevronRight,
   Ellipsis,
   Mail,
   MessageSquare,
   Phone,
   Trash2,
   UserPlus,
} from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { type Person } from './types'
import { type PersonDetail } from '@/components/people/types'

import { trpc } from '../../trpc'
import { PANES, type Pane } from './address'
import { ChatPane } from './chat-pane'
import { HistoryPane } from './history-pane'
import { inviteBlock, isDiscovery, messageAction } from './row-actions'
import { nextAfter, nextStepOf } from './rows'
import { type Ask } from './use-answer'
import { FIT_WORDS, STATUSES, foundByWord, isStatus, nameOf } from './words'

type PanelProps = {
   id: string
   // The rows of the table, in order, for Previous and Next; none hides them.
   order?: string[]
   pane: Pane
   onPane: (pane: Pane) => void
   onMove?: (id: string) => void
   // The person is gone (erased): the drawer moves on, or closes on the last row.
   onGone: (next: string | null) => void
   onAnswer: (ask: Ask) => void
   // Present once invites are live: opens the invite dialog for the person.
   onInvite?: (id: string) => void
}

type Props = PanelProps & {
   order: string[]
   onMove: (id: string) => void
   onClose: () => void
}

const useUpdate = () => {
   const utils = trpc.useUtils()

   return trpc.people.update.useMutation({
      onSuccess: () => utils.people.invalidate(),
      onError: error => toast.error(readableError(error)),
   })
}

const EraseDialog = ({
   person,
   open,
   onOpenChange,
   onErased,
}: {
   person: Person
   open: boolean
   onOpenChange: (open: boolean) => void
   onErased: () => void
}) => {
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
      <AlertDialog open={open} onOpenChange={onOpenChange}>
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
               <AlertDialogAction disabled={erase.isPending} onClick={() => erase.mutate({ id: person.id })}>
                  Erase
               </AlertDialogAction>
            </AlertDialogFooter>
         </AlertDialogContent>
      </AlertDialog>
   )
}

const Soon = ({ icon, label }: { icon: ReactNode; label: string }) => (
   <Button variant="outline" size="sm" disabled aria-label={`${label}: coming soon`}>
      {icon}
      {label}
      <span className="text-muted-foreground text-xs font-normal">Coming soon</span>
   </Button>
)

// A disabled button keeps its reason in a tooltip (a disabled button gets no pointer events, so the span carries it).
const Blocked = ({ reason, children }: { reason: string; children: ReactNode }) => (
   <Tooltip>
      <TooltipTrigger asChild>
         <span tabIndex={0} aria-label={reason}>
            {children}
         </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
   </Tooltip>
)

// Open chat in a new tab (the newest conversation, or a new message from the connected account), and Invite, with or without a note.
const ContactActions = ({ person, onInvite }: { person: Person; onInvite: ((id: string) => void) | undefined }) => {
   const message = messageAction(person)
   const blocked = inviteBlock(person, onInvite !== undefined)

   return (
      <>
         {message.kind === 'NONE' ? (
            <Blocked reason={message.reason}>
               <Button size="sm" variant="outline" disabled>
                  <MessageSquare />
                  Open chat
               </Button>
            </Blocked>
         ) : (
            <Button asChild size="sm">
               <a href={message.href} target="_blank" rel="noopener noreferrer">
                  <MessageSquare />
                  Open chat
               </a>
            </Button>
         )}
         {blocked || !onInvite ? (
            <Blocked reason={blocked ?? 'Invites are not on yet'}>
               <Button size="sm" variant="outline" disabled>
                  <UserPlus />
                  Invite
               </Button>
            </Blocked>
         ) : (
            <Button
               size="sm"
               variant={message.kind === 'NONE' ? 'default' : 'outline'}
               onClick={() => onInvite(person.id)}
            >
               <UserPlus />
               Invite
            </Button>
         )}
         <Soon icon={<Mail />} label="Email" />
         <Soon icon={<Phone />} label="Phone" />
      </>
   )
}

// The profile detail of a person; when brain has none for them, the same card and options from their My network row.
const useProfile = (person: Person): PersonDetail | undefined => {
   const detail = usePersonDetail(person.slug)

   return (
      detail.data ??
      (detail.error
         ? {
              slug: person.slug,
              url: person.url,
              profile: null,
              member: null,
              connections: [],
              conversations: [],
              suppressed: person.doNotContact,
              snapshot: null,
              read: null,
           }
         : undefined)
   )
}

// Who they are, from the profile read when there is one, with why they are here and how to reach them.
const Identity = ({ person, onInvite }: { person: Person; onInvite: ((id: string) => void) | undefined }) => {
   const detail = usePersonDetail(person.slug)
   const profile = useProfile(person)
   const utils = trpc.useUtils()
   const fetchedAt = detail.data?.snapshot?.fetchedAt ?? null
   const seen = useRef<string | null | undefined>(undefined)

   // A read that lands while the drawer is open puts its name, photo and facts on the row at once.
   useEffect(() => {
      if (!detail.data) {
         return
      }

      if (seen.current !== undefined && seen.current !== fetchedAt) {
         void utils.people.invalidate()
      }

      seen.current = fetchedAt
   }, [detail.data, fetchedAt, utils])
   const foundBy = person.foundBy.map(source => foundByWord(source, person.lists))
   const why = (
      <>
         {person.reasonText ? <p className="text-muted-foreground text-sm">{person.reasonText}</p> : null}
         {foundBy.length > 0 ? (
            <p className="text-muted-foreground text-sm">Also found by: {foundBy.join(', ')}</p>
         ) : null}
      </>
   )
   const actions = <ContactActions person={person} onInvite={onInvite} />

   if (profile) {
      return (
         <ProfileCard person={profile} clientId={person.clientId} actions={actions} known={person}>
            {why}
         </ProfileCard>
      )
   }

   return (
      <>
         <DrawerTitle className="sr-only">{nameOf(person)}</DrawerTitle>
         <Skeleton className="h-56 w-full rounded-xl" />
      </>
   )
}

// The owner's own handling of the person: status, labels, the next step, Do not contact, and the rarer actions in More.
const WorkBar = ({
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
   const [erasing, setErasing] = useState(false)
   const everywhere = trpc.people.doNotContactEverywhere.useMutation({
      onSuccess: async () => {
         toast.success(`${nameOf(person)} is on Do not contact for every client.`)
         await utils.people.invalidate()
      },
      onError: error => toast.error(readableError(error)),
   })
   const name = nameOf(person)
   const step = nextStepOf({
      ...person,
      invitesLive: false,
   })

   return (
      <div className="flex flex-wrap items-center gap-2">
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
         {person.fit === 'NONE' ? null : <Badge variant="secondary">{FIT_WORDS[person.fit]}</Badge>}
         {isDiscovery(person) ? <Badge variant="secondary">Discovery</Badge> : null}
         <span className="text-muted-foreground text-xs">Labels</span>
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
         <div className="ml-auto flex items-center gap-1">
            <Button
               variant={person.doNotContact ? 'destructive' : 'outline'}
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
            <DropdownMenu>
               <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8" aria-label="More">
                     <Ellipsis />
                  </Button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="end">
                  <DropdownMenuItem
                     disabled={everywhere.isPending}
                     onSelect={() => everywhere.mutate({ id: person.id })}
                  >
                     <Ban />
                     Do not contact for all clients
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setErasing(true)}>
                     <Trash2 />
                     Erase…
                  </DropdownMenuItem>
               </DropdownMenuContent>
            </DropdownMenu>
         </div>
         <EraseDialog person={person} open={erasing} onOpenChange={setErasing} onErased={onErased} />
      </div>
   )
}

const Notes = ({ person }: { person: Person }) => {
   const update = useUpdate()

   return (
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
   )
}

// The profile read as it is saved in the database (the allow-listed snapshot), to check what a read brought.
const DataTab = ({ slug }: { slug: string }) => {
   const detail = usePersonDetail(slug)
   const snapshot = detail.data?.snapshot

   if (!snapshot) {
      return (
         <p className="text-muted-foreground text-sm">
            {detail.error ? readableError(detail.error) : detail.data ? 'No profile read is saved yet.' : 'Loading…'}
         </p>
      )
   }

   const json = JSON.stringify(snapshot, null, 2)

   return (
      <CodeBlock>
         <CodeBlockHeader>
            <CodeBlockTitle>
               <Braces />
               Profile read · {new Date(snapshot.fetchedAt).toLocaleString()}
            </CodeBlockTitle>
            <CodeBlockActions>
               <CodeBlockCopyButton value={json} />
            </CodeBlockActions>
         </CodeBlockHeader>
         <CodeBlockContent wrap>{json}</CodeBlockContent>
      </CodeBlock>
   )
}

const ProfileTab = ({ person }: { person: Person }) => {
   const profile = useProfile(person)

   return profile ? <ProfileDetails person={profile} /> : <Skeleton className="h-40 w-full rounded-xl" />
}

// One person of My network, the same wherever they open: who they are, the owner's handling, notes, and the profile, chat,
// history and read tabs.
export const PersonPanel = ({ id, order = [], pane, onPane, onMove, onGone, onAnswer, onInvite }: PanelProps) => {
   const person = trpc.people.get.useQuery({ id }, { retry: false })
   const index = order.indexOf(id)
   const previous = index > 0 ? order[index - 1] : undefined
   const next = index >= 0 ? order[index + 1] : undefined

   const moves =
      order.length > 0 && onMove ? (
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
      ) : null

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

   // Flex, not grid: a fixed-height grid shrinks its rows when a tab is long, and the card collapsed to its border.
   return (
      <div className="flex flex-col gap-4 overflow-y-auto p-4 *:shrink-0">
         {moves}
         <Identity person={person.data} onInvite={onInvite} />
         <WorkBar
            person={person.data}
            pane={pane}
            onPane={onPane}
            onAnswer={onAnswer}
            onErased={() => onGone(nextAfter(order, id))}
         />
         <Notes person={person.data} />
         <Tabs value={pane} onValueChange={value => onPane(PANES.find(item => item === value) ?? 'chat')}>
            <TabsList>
               <TabsTrigger value="profile">Profile</TabsTrigger>
               <TabsTrigger value="chat">Chat</TabsTrigger>
               <TabsTrigger value="history">History</TabsTrigger>
               <TabsTrigger value="data">Data JSON</TabsTrigger>
            </TabsList>
            <TabsContent value="profile">
               <ProfileTab key={person.data.slug} person={person.data} />
            </TabsContent>
            <TabsContent value="chat">
               <ChatPane key={person.data.id} person={person.data} />
            </TabsContent>
            <TabsContent value="history">
               <HistoryPane person={person.data} />
            </TabsContent>
            <TabsContent value="data">
               <DataTab key={person.data.slug} slug={person.data.slug} />
            </TabsContent>
         </Tabs>
      </div>
   )
}

// One person of the client: who they are and why they are here, then the chat, the profile and the history.
export const PersonDrawer = ({ onClose, ...props }: Props) => (
   <Drawer direction="right" open onOpenChange={open => (open ? undefined : onClose())}>
      <DrawerContent className={floatingDrawer(WIDE)}>
         <ErrorBoundary where="person-drawer" resetKey={props.id}>
            <PersonPanel {...props} />
         </ErrorBoundary>
      </DrawerContent>
   </Drawer>
)
