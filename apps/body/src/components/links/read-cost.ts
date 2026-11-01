import { formatUsd } from '../workflows/types'

// The sentences around reading many companies or posts at once. An import or a bulk read skips an item read in the
// last 30 days.

export type ReadNoun = { one: string; many: string; micros: number }

// Copies of PRICE_MICROS.companyPage and .engagement: importing contracts at runtime would bundle zod (a unit test keeps
// them equal).
export const COMPANY_READ: ReadNoun = {
   one: 'company',
   many: 'companies',
   micros: 4_000,
}
export const POST_READ: ReadNoun = {
   one: 'post',
   many: 'posts',
   micros: 2_000,
}

export const RECENT_MS = 30 * 24 * 60 * 60 * 1000

const countOf = (noun: ReadNoun, count: number) => `${count} ${count === 1 ? noun.one : noun.many}`

export const isRecent = (readAt: Date | string | null, now = Date.now()) =>
   readAt !== null && now - new Date(readAt).getTime() < RECENT_MS

// What a read of these will cost: only the reads that will really be charged.
export const readCostLine = (noun: ReadNoun, charged: number, recent: number) =>
   [
      `About ${formatUsd(charged * noun.micros)} for ${countOf(noun, charged)}.`,
      recent > 0 ? `${countOf(noun, recent)} read in the last 30 days ${recent === 1 ? 'is' : 'are'} skipped.` : '',
   ]
      .filter(Boolean)
      .join(' ')

export type ReadTotals = { reading: number; readRecently: number; paused: number }

export const readResultLine = (noun: ReadNoun, { reading, readRecently, paused }: ReadTotals) =>
   [
      reading > 0 ? `Reading ${countOf(noun, reading)}; they fill in over the next minutes.` : 'Nothing to read.',
      readRecently > 0 ? `${countOf(noun, readRecently)} read in the last 30 days skipped.` : '',
      paused > 0
         ? `${countOf(noun, paused)} could not start now (reads are paused for a short while); try again later.`
         : '',
   ]
      .filter(Boolean)
      .join(' ')
