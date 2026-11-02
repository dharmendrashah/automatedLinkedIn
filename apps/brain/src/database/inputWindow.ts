import { type InputType } from '@automatedLinkedIn/contracts'

import { PrismaService } from './prisma.service'

// The time frame of an input block can be about a date of the item itself: when a post was posted or a company was last
// read (.plan/input-blocks-filters.md). Both live in the item's read, so this answers which items fit. An item that was
// never read has no such date and never fits.

// The most items one window holds; a plain message beyond it is not worth a guard, no owner is near it.
const WINDOW_CAP = 20_000

type Frame = { from: Date | null; until: Date | null }

const fits = (at: Date, { from, until }: Frame) => (!from || at >= from) && (!until || at < until)

export const slugsInWindow = async (
   userId: string,
   type: InputType,
   field: string,
   frame: Frame
): Promise<string[] | null> => {
   if (type === 'input.companies' && field === 'lastRead') {
      const rows = await PrismaService.client.pageSnapshot.findMany({
         where: {
            userId,
            kind: 'COMPANY',
            fetchedAt: {
               ...(frame.from ? { gte: frame.from } : {}),
               ...(frame.until ? { lt: frame.until } : {}),
            },
         },
         select: { slug: true },
         take: WINDOW_CAP,
      })

      return rows.map(({ slug }) => slug)
   }

   if (type === 'input.posts' && field === 'posted') {
      // The posted date is the data service's own text, so it is read here and anything that is not a date never fits.
      const rows = await PrismaService.client.$queryRaw<{ slug: string; postedAt: string | null }[]>`
         SELECT "slug", "data"->>'postedAt' AS "postedAt" FROM "PageSnapshot"
         WHERE "userId" = ${userId} AND "kind" = 'POST' LIMIT ${WINDOW_CAP}`

      return rows.filter(({ postedAt }) => postedAt && fits(new Date(postedAt), frame)).map(({ slug }) => slug)
   }

   return null
}
