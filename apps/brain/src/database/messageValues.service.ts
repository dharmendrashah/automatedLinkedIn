import { type PersonFacts, readSignals, readSnapshot } from 'core'

import { PrismaService } from './prisma.service'

// What the database already knows about people, for the variables of a message (.plan/message-composer.md): My network, the newest full
// profile read, and the entry in the owner's lists with the comments and reactions a workflow found. Nothing is read from LinkedIn.

export class MessageValuesService {
   // The first name of each sending account, by account id, for {account_first_name}.
   public static async accountFirstNames(userId: string, accountIds: string[]) {
      const accounts = accountIds.length
         ? await PrismaService.client.linkedInAccount.findMany({
              where: {
                 userId,
                 id: { in: accountIds },
              },
              select: {
                 id: true,
                 displayName: true,
              },
           })
         : []

      return new Map(
         accounts.flatMap(({ id, displayName }) => {
            const [first] = (displayName ?? '').trim().split(/\s+/)

            return first ? [[id, first] as const] : []
         })
      )
   }

   public static async factsFor(userId: string, slugs: string[]): Promise<Map<string, PersonFacts>> {
      const facts = new Map<string, PersonFacts>()

      if (slugs.length === 0) {
         return facts
      }

      const where = { slug: { in: slugs } }
      const [people, snapshots, members] = await Promise.all([
         PrismaService.client.person.findMany({
            where: {
               userId,
               ...where,
            },
            select: {
               slug: true,
               name: true,
               headline: true,
               company: true,
               title: true,
               skills: true,
               connectedAt: true,
               reasonKind: true,
               reasonText: true,
            },
         }),
         PrismaService.client.personSnapshot.findMany({
            where: {
               userId,
               ...where,
            },
            select: {
               slug: true,
               data: true,
            },
         }),
         PrismaService.client.workflowListMember.findMany({
            where: {
               list: { userId },
               ...where,
            },
            orderBy: { id: 'desc' },
            select: {
               slug: true,
               name: true,
               headline: true,
               location: true,
               title: true,
               company: true,
               signals: true,
            },
         }),
      ])
      const personOf = new Map(people.map(person => [person.slug, person]))
      const snapshotOf = new Map(
         snapshots.flatMap(({ slug, data }) => {
            const snapshot = readSnapshot(data)

            return snapshot ? [[slug, snapshot] as const] : []
         })
      )
      const memberOf = new Map<string, (typeof members)[number]>()

      for (const member of members) {
         if (!memberOf.has(member.slug)) {
            memberOf.set(member.slug, member)
         }
      }

      for (const slug of slugs) {
         const person = personOf.get(slug)
         const snapshot = snapshotOf.get(slug)
         const member = memberOf.get(slug)

         facts.set(slug, {
            name: person?.name ?? snapshot?.name ?? member?.name,
            headline: person?.headline ?? snapshot?.headline ?? member?.headline,
            location: snapshot?.location ?? member?.location,
            company: person?.company ?? member?.company,
            title: person?.title ?? member?.title,
            connectedAt: person?.connectedAt,
            theirNote: person?.reasonKind === 'REQUEST' ? person.reasonText : null,
            about: snapshot?.about,
            experience: snapshot?.experience,
            education: snapshot?.education,
            skills: snapshot?.skills.length ? snapshot.skills : person?.skills,
            signals: readSignals(member?.signals),
         })
      }

      return facts
   }
}
