import { ConflictError } from './conflict'
import { PrismaService } from './prisma.service'

const select = {
   id: true,
   name: true,
   query: true,
   updatedAt: true,
} as const

// The owner's saved Companies views (.plan/companies-filter-drawer.md); saving a name that exists overwrites it.
export class CompanyViewService {
   public static list(userId: string) {
      return PrismaService.client.companyView.findMany({
         where: { userId },
         orderBy: { name: 'asc' },
         select,
      })
   }

   public static save(userId: string, name: string, query: string) {
      return PrismaService.client.companyView.upsert({
         where: {
            userId_name: {
               userId,
               name,
            },
         },
         create: {
            userId,
            name,
            query,
         },
         update: { query },
         select,
      })
   }

   // A view that is not the owner's is answered like a missing one.
   public static async remove(userId: string, id: string) {
      const { count } = await PrismaService.client.companyView.deleteMany({
         where: {
            id,
            userId,
         },
      })

      if (count === 0) {
         throw new ConflictError('This view no longer exists.')
      }
   }
}
