import { type DataClient, DataServiceError } from 'core/dataClient'

import { ConflictError, uniqueOr } from './conflict'
import { PrismaService } from './prisma.service'
import { WalletService } from './wallet.service'

// One paid read the owner asked for (a full profile, a company page, a post), outside any workflow. Once a day per
// item: a second click the same day, or a double click, pays nothing. Nothing is booked when nothing was paid.
// Messages are shown to the client, so they never name the data supplier.

export type PageReader = Pick<DataClient, 'collect'>

export type ReadKind = 'profile' | 'company' | 'post' | 'comments' | 'reactions'

const NOUNS: Record<ReadKind, string> = {
   profile: 'this profile',
   company: 'this company page',
   post: 'this post',
   comments: 'the comments on this post',
   reactions: 'the reactions on this post',
}

const MISSING: Record<ReadKind, string> = {
   profile: 'No profile was found at this link.',
   company: 'No company page was found at this link.',
   post: 'No post was found at this link.',
   comments: 'No comments were found on this post.',
   reactions: 'No reactions were found on this post.',
}

// What the monthly statement calls these reads.
export const READ_LABELS: Record<ReadKind, string> = {
   profile: 'Profile reads',
   company: 'Company reads',
   post: 'Post reads',
   comments: 'Comment reads',
   reactions: 'Reaction reads',
}

export type ReadRows = [Record<string, unknown>, ...Record<string, unknown>[]]

type PaidRead = {
   userId: string
   kind: ReadKind
   slug: string
   // Tells reads of one item apart that may each happen once a day, such as up to 100 comments and all of them.
   variant?: string
   operation: string
   params: Record<string, unknown>
   reader: PageReader
   // Keeps what was read; called only when at least one row came back.
   store: (rows: ReadRows) => Promise<void>
}

export const paidRead = async ({ userId, kind, slug, variant, operation, params, reader, store }: PaidRead) => {
   const noun = NOUNS[kind]

   if (await WalletService.belowFloor()) {
      throw new ConflictError('Reads are paused for a short while. Please try again later.')
   }

   const day = new Date().toISOString().slice(0, 10)
   const callId = [`${kind}-read`, userId, slug, day, variant].filter(Boolean).join(':')

   await uniqueOr(
      PrismaService.client.spendLedger.create({
         data: {
            userId,
            callId,
            label: READ_LABELS[kind],
            amountMicros: 0,
            month: day.slice(0, 7),
         },
      }),
      `You already read ${noun} today.`
   )

   let charged = false

   try {
      const outcome = await reader.collect(operation, params, {
         jobId: null,
         onJobId: async () => undefined,
      })

      charged = outcome.costMicros > 0
      await PrismaService.client.spendLedger.update({
         where: { callId },
         data: { amountMicros: outcome.costMicros },
      })

      const [first, ...rest] = outcome.status === 'completed' ? outcome.rows : []

      if (!first) {
         throw new ConflictError(MISSING[kind])
      }

      await store([first, ...rest])
   } catch (error) {
      // Nothing was paid, so the owner may try again today.
      if (!charged) {
         await PrismaService.client.spendLedger.deleteMany({ where: { callId } })
      }

      throw error instanceof DataServiceError
         ? new ConflictError(`Reading ${noun} did not work. Please try again later.`)
         : error
   }
}
