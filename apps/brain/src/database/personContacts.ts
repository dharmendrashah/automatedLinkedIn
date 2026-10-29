import { PrismaService } from './prisma.service'

// How the owner's accounts know a person outside /profiles and lists: as a connection, or in a conversation of the Unibox.

export const profileUrlOf = (slug: string) => `https://www.linkedin.com/in/${slug}/`

const ACCOUNT = {
   select: {
      displayName: true,
      email: true,
   },
} as const

const nameOf = (account: { displayName: string | null; email: string }) => account.displayName ?? account.email

// The connection rows of the owner's accounts for this person, still connected.
export const connectionsOf = async (userId: string, slug: string) =>
   (
      await PrismaService.client.linkedInConnection.findMany({
         where: {
            userId,
            slug,
            account: { userId },
            status: { notIn: ['REMOVED', 'GONE'] },
         },
         orderBy: { createdAt: 'asc' },
         select: {
            accountId: true,
            account: ACCOUNT,
            name: true,
            headline: true,
            photoUrl: true,
            connectedOn: true,
         },
      })
   ).map(({ connectedOn, account, ...row }) => ({
      ...row,
      accountName: nameOf(account),
      connectedOn: connectedOn?.toISOString().slice(0, 10) ?? null,
   }))

// The one-to-one conversations of the owner's accounts with this person: by their profile address, or begun by a first message to them.
export const conversationsWith = async (userId: string, slug: string) => {
   const begun = await PrismaService.client.linkedInReply.findMany({
      where: {
         userId,
         recipientSlug: slug,
         conversationId: { not: null },
      },
      select: { conversationId: true },
   })
   const rows = await PrismaService.client.linkedInConversation.findMany({
      where: {
         userId,
         account: { userId },
         kind: 'DIRECT',
         OR: [
            { contactProfileUrl: { in: [profileUrlOf(slug), profileUrlOf(slug).slice(0, -1)] } },
            { id: { in: begun.flatMap(({ conversationId }) => conversationId ?? []) } },
         ],
      },
      orderBy: {
         lastMessageAt: {
            sort: 'desc',
            nulls: 'last',
         },
      },
      select: {
         id: true,
         accountId: true,
         account: ACCOUNT,
         title: true,
      },
   })

   return rows.map(({ title, account, ...row }) => ({
      ...row,
      accountName: nameOf(account),
      name: title,
   }))
}
