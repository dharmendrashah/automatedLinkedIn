import { type DataClient, DataServiceError } from 'core/dataClient'

import { ConflictError, uniqueOr } from './conflict'
import { PrismaService } from './prisma.service'
import { WalletService } from './wallet.service'

// One paid read the owner asked for (a full profile, a company page, a post), outside any workflow. Once a day per
// item: a second click the same day, or a double click, pays nothing. Nothing is booked when nothing was paid.
// Messages are shown to the client, so they never name the data supplier.

export type PageReader = Pick<DataClient, 'collect'>

export type ReadKind = 'profile' | 'company' | 'post'

const NOUNS: Record<ReadKind, string> = {
   profile: 'profile',
   company: 'company page',
   post: 'post',
}

// What the monthly statement calls these reads.
export const READ_LABELS: Record<ReadKind, string> = {
   profile: 'Profile reads',
   company: 'Company reads',
   post: 'Post reads',
}

type PaidRead = {
   userId: string
   kind: ReadKind
   slug: string
   operation: string
   params: Record<string, unknown>
   reader: PageReader
   // Keeps what was read; called with the first row only.
   store: (row: Record<string, unknown>) => Promise<void>
}

export const paidRead = async ({ userId, kind, slug, operation, params, reader, store }: PaidRead) => {
   const noun = NOUNS[kind]

   if (await WalletService.belowFloor()) {
      throw new ConflictError('Reads are paused for a short while. Please try again later.')
   }

   const day = new Date().toISOString().slice(0, 10)
   const callId = `${kind}-read:${userId}:${slug}:${day}`

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
      `This ${noun} was already read today.`
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

      const [row] = outcome.status === 'completed' ? outcome.rows : []

      if (!row) {
         throw new ConflictError(`No ${noun} was found at this link.`)
      }

      await store(row)
   } catch (error) {
      // Nothing was paid, so the owner may try again today.
      if (!charged) {
         await PrismaService.client.spendLedger.deleteMany({ where: { callId } })
      }

      throw error instanceof DataServiceError
         ? new ConflictError(`Reading the ${noun} did not work. Please try again later.`)
         : error
   }
}
