import { type LoadingStepName, loadingOf } from './accountLoading'
import { CONNECTIONS_TASK } from './linkedInConnection.hooks'
import { INVITATIONS_TASK } from './linkedInInvitation.hooks'
import { MESSAGES_TASK } from './linkedInMessages.hooks'
import { PROFILE_TASK } from './linkedInProfile.hooks'
import { PrismaService } from './prisma.service'

const DAY_MS = 24 * 60 * 60 * 1000
// A run older than this is not reading any more, whatever its row says (the longest first read is limited to 100 minutes).
const READING_MS = 2 * 60 * 60 * 1000

const STEP_OF: Record<string, LoadingStepName> = {
   [PROFILE_TASK]: 'PROFILE',
   [CONNECTIONS_TASK]: 'CONNECTIONS',
   [INVITATIONS_TASK]: 'REQUESTS',
   [MESSAGES_TASK]: 'MESSAGES',
}

const stepOf = (task: string | null) => (task ? STEP_OF[task] : undefined) ?? []

type AccountRow = {
   id: string
   firstSignedInAt: Date | null
   lastVerifiedAt: Date | null
   connectionsReadAt: Date | null
   invitationsReadAt: Date | null
   messagesBackfilledAt: Date | null
}

// "Getting your LinkedIn ready" for each of the owner's accounts, in four queries for all of them.
export const loadingsOf = async (userId: string, accounts: AccountRow[], now = new Date()) => {
   const ids = accounts.map(({ id }) => id)
   const db = PrismaService.client
   const [profiles, conversations, sessions, tries] = await Promise.all([
      db.linkedInAccountProfile.findMany({
         where: {
            userId,
            accountId: { in: ids },
         },
         select: { accountId: true },
      }),
      db.linkedInConversation.groupBy({
         by: ['accountId'],
         where: {
            userId,
            accountId: { in: ids },
         },
         _count: { _all: true },
      }),
      db.spiderSession.findMany({
         where: {
            userId,
            linkedInAccountId: { in: ids },
            task: { in: Object.keys(STEP_OF) },
            startedAt: { gte: new Date(now.getTime() - DAY_MS) },
         },
         select: {
            linkedInAccountId: true,
            task: true,
            status: true,
            startedAt: true,
         },
      }),
      db.spiderSession.groupBy({
         by: ['linkedInAccountId'],
         where: {
            userId,
            linkedInAccountId: { in: ids },
            task: PROFILE_TASK,
         },
         _count: { _all: true },
      }),
   ])
   const stored = new Set(profiles.map(({ accountId }) => accountId))
   const counted = new Map(conversations.map(({ accountId, _count }) => [accountId, _count._all]))
   const triesOf = new Map(tries.map(({ linkedInAccountId, _count }) => [linkedInAccountId, _count._all]))

   return new Map(
      accounts.map(account => {
         const own = sessions.filter(({ linkedInAccountId }) => linkedInAccountId === account.id)
         const reading = new Set(
            own
               .filter(
                  ({ status, startedAt }) =>
                     status === 'IN_PROGRESS' && now.getTime() - startedAt.getTime() < READING_MS
               )
               .flatMap(({ task }) => stepOf(task))
         )
         // A finished batch of the first message read is how that read goes on, not a failure.
         const notFinished = new Set(
            own
               .filter(({ status, task }) => status !== 'IN_PROGRESS' && task !== MESSAGES_TASK)
               .flatMap(({ task }) => stepOf(task))
         )

         return [
            account.id,
            loadingOf({
               signedIn: (account.firstSignedInAt ?? account.lastVerifiedAt) !== null,
               profileStored: stored.has(account.id),
               profileTries: triesOf.get(account.id) ?? 0,
               connectionsReadAt: account.connectionsReadAt,
               invitationsReadAt: account.invitationsReadAt,
               messagesBackfilledAt: account.messagesBackfilledAt,
               conversations: counted.get(account.id) ?? 0,
               reading,
               notFinished,
            }),
         ] as const
      })
   )
}
