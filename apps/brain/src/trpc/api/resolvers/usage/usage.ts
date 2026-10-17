import { z } from 'zod'

import { toCsv } from 'core'

import { SpendService, WalletService, floorMicros, warnMicros } from 'database'

import { adminProcedure, ownerProcedure, router } from 'trpc'

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)

const dollars = (micros: number) => (micros / 1_000_000).toFixed(4)

// What the data cost: the client's own months, and for the platform owner the wallet and every client's spend.
export const usage = router({
   months: ownerProcedure.query(({ ctx }) => SpendService.usage(ctx.user.id)),

   // A mutation so the download is only built when asked for and never cached.
   statementCsv: ownerProcedure.input(z.object({ month })).mutation(async ({ ctx, input }) => {
      const lines = await SpendService.statement(ctx.user.id, input.month)
      const total = lines.reduce((sum, line) => sum + line.amountMicros, 0)

      return {
         fileName: `data-cost-${input.month}.csv`,
         csv: toCsv(
            ['Month', 'Workflow', 'Runs charged', 'Data cost (USD)'],
            [
               ...lines.map(line => [input.month, line.name, String(line.runs), dollars(line.amountMicros)]),
               [input.month, 'Total', '', dollars(total)],
            ]
         ),
      }
   }),

   wallet: adminProcedure.query(async () => ({
      wallet: await WalletService.read(),
      floorMicros: floorMicros(),
      warnMicros: warnMicros(),
   })),

   byClient: adminProcedure.input(z.object({ month })).query(({ input }) => SpendService.byClient(input.month)),
})
