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

// The profile of chats the address does not give, by the rule the people index uses (`people_index_conversation_slug`): the first
// message's recipient, else the one profile of that name the account knows, else the one My network person of that name.
const slugsOf = async (ids: string[]) =>
   ids.length > 0
      ? PrismaService.client.$queryRaw<Array<{ id: string; slug: string | null }>>`
           SELECT "id", people_index_conversation_slug("id", "contactProfileUrl") AS "slug"
           FROM "LinkedInConversation" WHERE "id" = ANY(${ids})`
      : []

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

   for (const { id, slug } of await slugsOf(direct.filter(({ id }) => !slugs.has(id)).map(({ id }) => id))) {
      if (slug) {
         slugs.set(id, slug)
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
