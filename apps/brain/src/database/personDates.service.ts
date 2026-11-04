import { PrismaService } from './prisma.service'

// The moments of a person's story with the owner that "Wait per person" counts from. A moment nobody knows is null.
export type PersonDates = {
   // The newest of their accepts of the owner's invites (a real time).
   accepted: Date | null
   connected: Date | null
   invited: Date | null
   wrote: Date | null
   wroteBack: Date | null
   added: Date | null
}

export type PersonMoment = keyof PersonDates

export class PersonDatesService {
   // The dates of the people with these slugs, for the owner. A person My network does not hold has no entry.
   public static async forSlugs(userId: string, slugs: string[]): Promise<Map<string, PersonDates>> {
      if (slugs.length === 0) {
         return new Map()
      }

      const db = PrismaService.client
      const [people, accepts] = await Promise.all([
         db.person.findMany({
            where: {
               userId,
               slug: { in: slugs },
            },
            select: {
               slug: true,
               connectedAt: true,
               invitedAt: true,
               lastSentAt: true,
               lastReceivedAt: true,
               firstSeenAt: true,
            },
         }),
         db.linkedInInvite.groupBy({
            by: ['slug'],
            where: {
               userId,
               slug: { in: slugs },
               acceptedAt: { not: null },
            },
            _max: { acceptedAt: true },
         }),
      ])
      const accepted = new Map(accepts.map(({ slug, _max }) => [slug, _max.acceptedAt]))
      const held = new Map(people.map(person => [person.slug, person]))

      // A person who accepted an invite made here has dates even when My network does not hold them yet.
      return new Map(
         [...new Set([...held.keys(), ...accepted.keys()])].map(slug => {
            const person = held.get(slug)

            return [
               slug,
               {
                  accepted: accepted.get(slug) ?? null,
                  connected: person?.connectedAt ?? null,
                  invited: person?.invitedAt ?? null,
                  wrote: person?.lastSentAt ?? null,
                  wroteBack: person?.lastReceivedAt ?? null,
                  added: person?.firstSeenAt ?? null,
               },
            ]
         })
      )
   }
}
