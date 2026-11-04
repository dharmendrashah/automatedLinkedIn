import {
   COMPANY_SIGNAL_TYPES,
   type CompanySignalType,
   SIGNAL_TYPES,
   type SignalType,
} from '@automatedLinkedIn/contracts'

import { PrismaService } from './prisma.service'

// The signal store (.plan/lead-pipeline-p7-ranking.md): what a person or a company showed, one row per type, source and day. Rows are
// written by the Score blocks from what the run found, read by the same blocks, and deleted with the person.

const DAY_MS = 24 * 60 * 60 * 1000

export const SIGNALS_KEEP_DAYS = 365
export const SIGNAL_EXCERPT_DAYS = 90
const EXCERPT_MAX = 140
const VIA_MAX = 300

export type PersonSignalRow = { slug: string; type: SignalType; via: string; at: Date; excerpt?: string | null }

export type CompanySignalRow = { slug: string; type: CompanySignalType; via: string; at: Date }

export type Shown<T> = { type: T; at: Date }

const dayOf = (at: Date) => new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()))

const isPersonType = (type: string): type is SignalType => SIGNAL_TYPES.some(known => known === type)

const isCompanyType = (type: string): type is CompanySignalType => COMPANY_SIGNAL_TYPES.some(known => known === type)

const group = <T extends string>(
   rows: Array<{ slug: string; type: string; at: Date }>,
   valid: (type: string) => type is T
) => {
   const bySlug = new Map<string, Array<Shown<T>>>()

   for (const { slug, type, at } of rows) {
      if (valid(type)) {
         bySlug.set(slug, [
            ...(bySlug.get(slug) ?? []),
            {
               type,
               at,
            },
         ])
      }
   }

   return bySlug
}

export class SignalService {
   // Writes the rows that are new; a row seen again (same person, type, source and day) adds nothing. People on Do not contact (a
   // suppression) get none. Resolves to how many rows were added.
   public static async recordPeople(userId: string, rows: PersonSignalRow[]) {
      if (rows.length === 0) {
         return 0
      }

      const db = PrismaService.client
      const stopped = await db.suppression.findMany({
         where: {
            userId,
            slug: { in: [...new Set(rows.map(({ slug }) => slug))] },
         },
         select: { slug: true },
      })
      const blocked = new Set(stopped.map(({ slug }) => slug))
      const { count } = await db.personSignal.createMany({
         data: rows
            .filter(({ slug }) => !blocked.has(slug))
            .map(({ slug, type, via, at, excerpt }) => ({
               userId,
               slug,
               type,
               via: via.slice(0, VIA_MAX),
               at,
               day: dayOf(at),
               excerpt: excerpt?.slice(0, EXCERPT_MAX) ?? null,
            })),
         skipDuplicates: true,
      })

      return count
   }

   public static async recordCompanies(userId: string, rows: CompanySignalRow[]) {
      if (rows.length === 0) {
         return 0
      }

      const { count } = await PrismaService.client.companySignal.createMany({
         data: rows.map(({ slug, type, via, at }) => ({
            userId,
            slug,
            type,
            via: via.slice(0, VIA_MAX),
            at,
            day: dayOf(at),
         })),
         skipDuplicates: true,
      })

      return count
   }

   // The signals of these people, by slug, newest kept for a year.
   public static async forPeople(userId: string, slugs: string[], now = new Date()) {
      if (slugs.length === 0) {
         return new Map<string, Array<Shown<SignalType>>>()
      }

      const rows = await PrismaService.client.personSignal.findMany({
         where: {
            userId,
            slug: { in: slugs },
            at: { gte: new Date(now.getTime() - SIGNALS_KEEP_DAYS * DAY_MS) },
         },
         select: {
            slug: true,
            type: true,
            at: true,
         },
      })

      return group(rows, isPersonType)
   }

   public static async forCompanies(userId: string, slugs: string[], now = new Date()) {
      if (slugs.length === 0) {
         return new Map<string, Array<Shown<CompanySignalType>>>()
      }

      const rows = await PrismaService.client.companySignal.findMany({
         where: {
            userId,
            slug: { in: slugs },
            at: { gte: new Date(now.getTime() - SIGNALS_KEEP_DAYS * DAY_MS) },
         },
         select: {
            slug: true,
            type: true,
            at: true,
         },
      })

      return group(rows, isCompanyType)
   }

   // Rows older than a year go; the shortened text of a comment goes after 90 days. Resolves to the counts.
   public static async cleanup(now = new Date()) {
      const db = PrismaService.client
      const [people, companies, excerpts] = await Promise.all([
         db.personSignal.deleteMany({ where: { at: { lt: new Date(now.getTime() - SIGNALS_KEEP_DAYS * DAY_MS) } } }),
         db.companySignal.deleteMany({ where: { at: { lt: new Date(now.getTime() - SIGNALS_KEEP_DAYS * DAY_MS) } } }),
         db.personSignal.updateMany({
            where: {
               excerpt: { not: null },
               at: { lt: new Date(now.getTime() - SIGNAL_EXCERPT_DAYS * DAY_MS) },
            },
            data: { excerpt: null },
         }),
      ])

      return {
         people: people.count,
         companies: companies.count,
         excerpts: excerpts.count,
      }
   }
}
