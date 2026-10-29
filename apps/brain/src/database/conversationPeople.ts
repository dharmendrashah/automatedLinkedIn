import { PrismaService } from './prisma.service'

type Person = {
   name: string
   profileUrl?: string
   imageUrl?: string
}

type Shown = {
   id: string
   accountId: string
   kind: string
   participants: Person[]
   starting?: string
}

const SLUG = /\/in\/([^/?#]+)/
// LinkedIn names a person by member id (ACoAA...) in a conversation begun by a message; that is not their profile name.
const MEMBER_ID = /^ACo/

const profileSlug = (url: string | undefined) => {
   const [, slug] = SLUG.exec(url ?? '') ?? []

   return slug && !MEMBER_ID.test(slug) ? slug : undefined
}

// The person of each one-to-one conversation by profile name (`contactSlug`), for the person drawer, and their picture from the
// account's stored connection when the read gave none. One query each, whatever the number of conversations.
export const withPeople = async <T extends Shown>(
   userId: string,
   shown: T[]
): Promise<Array<T & { contactSlug?: string }>> => {
   const direct = shown.filter(({ kind }) => kind === 'DIRECT')
   const slugs = new Map(
      direct.flatMap(item => {
         const slug = item.starting ?? profileSlug(item.participants[0]?.profileUrl)

         return slug ? [[item.id, slug] as const] : []
      })
   )
   const unknown = direct.filter(({ id }) => !slugs.has(id)).map(({ id }) => id)
   const begun =
      unknown.length > 0
         ? await PrismaService.client.linkedInReply.findMany({
              where: {
                 userId,
                 conversationId: { in: unknown },
                 recipientSlug: { not: null },
              },
              select: {
                 conversationId: true,
                 recipientSlug: true,
              },
           })
         : []

   for (const { conversationId, recipientSlug } of begun) {
      if (conversationId && recipientSlug) {
         slugs.set(conversationId, recipientSlug)
      }
   }

   const bare = direct.filter(item => slugs.has(item.id) && !item.participants[0]?.imageUrl)
   const pictures =
      bare.length > 0
         ? await PrismaService.client.linkedInConnection.findMany({
              where: {
                 userId,
                 account: { userId },
                 accountId: { in: [...new Set(bare.map(({ accountId }) => accountId))] },
                 slug: { in: [...new Set(bare.flatMap(({ id }) => slugs.get(id) ?? []))] },
                 photoUrl: { not: null },
              },
              select: {
                 accountId: true,
                 slug: true,
                 photoUrl: true,
              },
           })
         : []
   const pictureOf = new Map(pictures.map(row => [`${row.accountId}:${row.slug}`, row.photoUrl]))

   return shown.map(item => {
      const slug = slugs.get(item.id)

      if (!slug) {
         return item
      }

      const [first, ...rest] = item.participants
      const imageUrl = first && !first.imageUrl ? pictureOf.get(`${item.accountId}:${slug}`) : undefined

      return {
         ...item,
         contactSlug: slug,
         ...(first &&
            imageUrl && {
               participants: [
                  {
                     ...first,
                     imageUrl,
                  },
                  ...rest,
               ],
            }),
      }
   })
}
