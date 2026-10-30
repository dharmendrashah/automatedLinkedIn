import { uniqueOr } from './conflict'
import { PrismaService } from './prisma.service'

const DEFAULT_NAME = 'My accounts'

// Who the owner works for (.plan/network-hub.md). Accounts, lists and targets with no client belong to the default one.
export class ClientService {
   // The owner's default client, made on first use.
   public static async defaultId(userId: string) {
      const db = PrismaService.client
      const found = await db.client.findFirst({
         where: {
            userId,
            isDefault: true,
         },
         select: { id: true },
      })

      if (found) {
         return found.id
      }

      const name = (await db.client.count({
         where: {
            userId,
            name: DEFAULT_NAME,
         },
      }))
         ? `${DEFAULT_NAME} (default)`
         : DEFAULT_NAME
      const made = await db.client.upsert({
         where: {
            userId_name: {
               userId,
               name,
            },
         },
         create: {
            userId,
            name,
            isDefault: true,
         },
         update: { isDefault: true },
         select: { id: true },
      })

      return made.id
   }

   // Every client of the owner, the default first, with its accounts and lists (rows with no client go to the default one).
   public static async list(userId: string) {
      const defaultId = await ClientService.defaultId(userId)
      const db = PrismaService.client
      const [clients, accounts, lists] = await Promise.all([
         db.client.findMany({
            where: { userId },
            orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
            select: {
               id: true,
               name: true,
               isDefault: true,
            },
         }),
         db.linkedInAccount.findMany({
            where: { userId },
            orderBy: { createdAt: 'asc' },
            select: {
               id: true,
               email: true,
               displayName: true,
               status: true,
               clientId: true,
            },
         }),
         db.workflowList.findMany({
            where: { userId },
            orderBy: { createdAt: 'asc' },
            select: {
               id: true,
               name: true,
               clientId: true,
            },
         }),
      ])
      const of = (clientId: string | null) => clientId ?? defaultId

      return clients.map(client => ({
         ...client,
         accounts: accounts
            .filter(account => of(account.clientId) === client.id)
            .map(({ clientId: _clientId, ...account }) => account),
         lists: lists.filter(list => of(list.clientId) === client.id).map(({ clientId: _clientId, ...list }) => list),
      }))
   }

   public static create(userId: string, name: string) {
      return uniqueOr(
         PrismaService.client.client.create({
            data: {
               userId,
               name,
            },
            select: {
               id: true,
               name: true,
               isDefault: true,
            },
         }),
         'You already have a client with that name.'
      )
   }

   public static async rename(userId: string, id: string, name: string) {
      const { count } = await uniqueOr(
         PrismaService.client.client.updateMany({
            where: {
               id,
               userId,
            },
            data: { name },
         }),
         'You already have a client with that name.'
      )

      return count === 1
   }

   // Moves an account to a client (its people move with it, through the index triggers). False when either is not the owner's.
   public static async assignAccount(userId: string, accountId: string, clientId: string) {
      const db = PrismaService.client
      const client = await db.client.findFirst({
         where: {
            id: clientId,
            userId,
         },
         select: { id: true },
      })

      if (!client) {
         return false
      }

      const { count } = await db.linkedInAccount.updateMany({
         where: {
            id: accountId,
            userId,
         },
         data: { clientId },
      })

      return count === 1
   }

   // The client id a request names, when it is the owner's; the default client when none is named.
   public static async owned(userId: string, clientId: string | undefined) {
      if (!clientId) {
         return ClientService.defaultId(userId)
      }

      const found = await PrismaService.client.client.findFirst({
         where: {
            id: clientId,
            userId,
         },
         select: { id: true },
      })

      return found?.id ?? null
   }
}
