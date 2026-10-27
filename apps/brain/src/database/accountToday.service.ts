import { VISIT_TASK } from './linkedInAccount.service'
import { LOGIN_TASK } from './linkedInAccountValidation.service'
import { INVITATIONS_TASK } from './linkedInInvitation.hooks'
import { MESSAGES_TASK } from './linkedInMessages.hooks'
import { PrismaService } from './prisma.service'

export type TodayItemName = 'login' | 'visit' | 'messages' | 'network'

// The newest run of a task is what the page shows; sessions older than this are deleted anyway.
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000

const ITEM_OF_TASK: Record<string, TodayItemName> = {
   [LOGIN_TASK]: 'login',
   [VISIT_TASK]: 'visit',
   [MESSAGES_TASK]: 'messages',
   [INVITATIONS_TASK]: 'network',
}

const NAMES: TodayItemName[] = ['login', 'visit', 'messages', 'network']

type Run = {
   id: string
   status: 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED'
   verdict: string | null
   trigger: string | null
   startedAt: Date
   finishedAt: Date | null
}

export type TodayItem = {
   item: TodayItemName
   // When the account's schedule runs it next; null when none is planned.
   next: Date | null
   // The newest run in the last 30 days, and the newest one that worked. `queued`: the newest still waits to be published.
   last: (Run & { queued: boolean }) | null
   lastOk: Run | null
}

export type TodayAccount = {
   accountId: string
   // The first read of the messages still goes in batches.
   firstRead: boolean
   items: TodayItem[]
}

// A run of the old kind has no task; an account check is the login.
const itemOf = ({ task, kind }: { task: string | null; kind: string }): TodayItemName | undefined =>
   task === null ? (kind === 'VALIDATE_ACCOUNT' ? 'login' : undefined) : ITEM_OF_TASK[task]

const select = {
   id: true,
   linkedInAccountId: true,
   task: true,
   kind: true,
   status: true,
   verdict: true,
   trigger: true,
   startedAt: true,
   finishedAt: true,
} as const

// What each of an owner's accounts did for its four daily items and when each comes next (.plan/accounts-today-checklist.md).
// Three queries for every account, owner-scoped; sessions are only read, and no schedule or task is touched.
export class AccountTodayService {
   public static async forUser(userId: string, now = new Date()): Promise<TodayAccount[]> {
      const db = PrismaService.client
      const accounts = await db.linkedInAccount.findMany({
         where: { userId },
         orderBy: { createdAt: 'asc' },
         select: {
            id: true,
            nextCheckAt: true,
            nextBrowseAt: true,
            nextMessagesAt: true,
            nextInvitationsAt: true,
            messagesBackfilledAt: true,
         },
      })

      if (accounts.length === 0) {
         return []
      }

      const where = {
         userId,
         linkedInAccountId: { in: accounts.map(({ id }) => id) },
         startedAt: { gte: new Date(now.getTime() - WINDOW_MS) },
         OR: [
            { task: { in: Object.keys(ITEM_OF_TASK) } },
            {
               task: null,
               kind: 'VALIDATE_ACCOUNT' as const,
            },
         ],
      }
      const newest = {
         distinct: ['linkedInAccountId', 'task'] as ['linkedInAccountId', 'task'],
         orderBy: { startedAt: 'desc' as const },
      }
      const [latest, worked] = await Promise.all([
         db.spiderSession.findMany({
            where,
            ...newest,
            select: {
               ...select,
               dispatch: { select: { sessionId: true } },
            },
         }),
         db.spiderSession.findMany({
            where: {
               ...where,
               status: 'SUCCEEDED',
            },
            ...newest,
            select,
         }),
      ])
      const first = <T extends { linkedInAccountId: string; task: string | null; kind: string }>(rows: T[]) => {
         const found = new Map<string, T>()

         // Newest first, so the first one of an account and item is the newest (a login can come as two kinds of row).
         for (const row of rows) {
            const item = itemOf(row)
            const key = `${row.linkedInAccountId}:${item}`

            if (item && !found.has(key)) {
               found.set(key, row)
            }
         }

         return found
      }
      const lastOf = first(latest)
      const okOf = first(worked)
      const run = ({ id, status, verdict, trigger, startedAt, finishedAt }: Run): Run => ({
         id,
         status,
         verdict,
         trigger,
         startedAt,
         finishedAt,
      })

      return accounts.map(account => {
         const next: Record<TodayItemName, Date | null> = {
            login: account.nextCheckAt,
            visit: account.nextBrowseAt,
            messages: account.nextMessagesAt,
            network: account.nextInvitationsAt,
         }

         return {
            accountId: account.id,
            firstRead: account.messagesBackfilledAt === null,
            items: NAMES.map(item => {
               const last = lastOf.get(`${account.id}:${item}`)
               const ok = okOf.get(`${account.id}:${item}`)

               return {
                  item,
                  next: next[item],
                  last: last
                     ? {
                          ...run(last),
                          queued: last.dispatch !== null,
                       }
                     : null,
                  lastOk: ok ? run(ok) : null,
               }
            }),
         }
      })
   }
}
