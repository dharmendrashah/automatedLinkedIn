import { StartAnywayDialog } from '@/components/accounts/start-anyway-dialog'
import { DetailLoading } from '@/components/details/detail-parts'
import { PersonView } from '@/components/people/person-view'
import { useState } from 'react'

import { trpc } from '../../trpc'
import { type Pane } from './address'
import { InviteDialog } from './invite-dialog'
import { PersonPanel } from './person-drawer'
import { isDiscovery } from './row-actions'
import { useAnswer } from './use-answer'

// What the panel asks of the page around it, for pages other than My network: answering a request and inviting the person.
const PersonActions = ({ id, onGone }: { id: string; onGone: () => void }) => {
   const [pane, setPane] = useState<Pane>('profile')
   const [inviting, setInviting] = useState(false)
   const person = trpc.people.get.useQuery({ id }, { retry: false })
   const today = trpc.people.today.useQuery()
   const invitesLive = today.data?.some(line => line.invitesLive) ?? false
   const { answer, refusal, goAnyway, stopAsking } = useAnswer()

   return (
      <>
         <PersonPanel
            id={id}
            pane={pane}
            onPane={setPane}
            onGone={onGone}
            onAnswer={answer}
            {...(invitesLive && { onInvite: () => setInviting(true) })}
         />
         {person.data ? (
            <InviteDialog
               clientId={person.data.clientId}
               personIds={inviting ? [id] : []}
               pickAccount={isDiscovery(person.data)}
               source={undefined}
               onClose={() => setInviting(false)}
               onDone={() => setInviting(false)}
            />
         ) : null}
         <StartAnywayDialog message={refusal} onConfirm={goAnyway} onCancel={stopAsking} />
      </>
   )
}

// A person opened by profile on any page: the My network drawer when they are on My network, the profile view when they are not
// (a post commenter, say).
export const PersonBySlug = ({ slug, onClose }: { slug: string; onClose: () => void }) => {
   const found = trpc.people.find.useQuery({ slug }, { retry: false })

   if (found.isPending) {
      return <DetailLoading what="person" />
   }

   return found.data ? <PersonActions id={found.data.id} onGone={onClose} /> : <PersonView slug={slug} />
}
