import { DATA_WALLET_FLOOR_USD, DATA_WALLET_WARN_USD } from 'env'

import { PrismaService } from './prisma.service'

const WALLET_ID = 'shared'

export const floorMicros = () => Math.round(DATA_WALLET_FLOOR_USD * 1_000_000)
export const warnMicros = () => Math.round(DATA_WALLET_WARN_USD * 1_000_000)

// The shared data wallet as the worker last read it. The API never calls the data service; it trusts this row.
export class WalletService {
   public static read() {
      return PrismaService.client.dataWallet.findUnique({
         where: { id: WALLET_ID },
         select: {
            balanceMicros: true,
            checkedAt: true,
         },
      })
   }

   public static save(balanceMicros: number) {
      const checkedAt = new Date()

      return PrismaService.client.dataWallet.upsert({
         where: { id: WALLET_ID },
         create: {
            id: WALLET_ID,
            balanceMicros,
            checkedAt,
         },
         update: {
            balanceMicros,
            checkedAt,
         },
      })
   }

   // Unknown until the worker read it once; then the floor decides.
   public static async belowFloor() {
      const wallet = await WalletService.read()

      return wallet !== null && wallet.balanceMicros < floorMicros()
   }
}
