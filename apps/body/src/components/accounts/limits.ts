import { type RouterOutputs } from '../../trpc'

export type AccountRoom = RouterOutputs['linkedInAccount']['room'][number]

// The platform's rough cap on pending invites (an estimate); only the share of it is shown, never the random draw behind a limit.
const PENDING_CAP = 3000

const part = ({ limit, used }: { limit: number; used: number }) => `${Math.min(used, limit)} of ${limit}`

// The lines of "Today's limits" in the account drawer: what each act may do today and what it did.
export const limitLines = (room: AccountRoom) => [
   {
      label: 'Connection requests',
      text: `${part(room.invites)}, this week ${part(room.invitesWeek)}`,
   },
   {
      label: 'First messages',
      text: part(room.firstMessages),
   },
   {
      label: 'Reactions',
      text: part(room.reactions),
   },
   {
      label: 'Comments',
      text: part(room.comments),
   },
]

export const pendingLine = ({ pending }: AccountRoom) =>
   `${pending.count.toLocaleString('en-US')} (${Math.round(pending.share * 100)} %)`

// The notice for an account near or over its pending cap; nothing while it is fine. The count covers only invites made here.
export const pendingNotice = (name: string, { pending }: AccountRoom) => {
   const count = pending.count.toLocaleString('en-US')
   const share = Math.round((pending.count / PENDING_CAP) * 100)

   if (pending.level === 'paused') {
      return `New invites for ${name} are paused. Other accounts go on.`
   }

   return pending.level === 'notice'
      ? `${name} has ${count} pending invites (${share} % of about ${PENDING_CAP.toLocaleString('en-US')}). New invites will pause at 2,850.`
      : undefined
}
