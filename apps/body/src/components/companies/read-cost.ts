import { formatUsd } from '../workflows/types'

// The sentences around reading many companies at once (.plan/companies-import-csv.md). An import or a bulk read skips a
// company read in the last 30 days.

// A copy of PRICE_MICROS.companyPage: importing contracts at runtime would bundle zod (a unit test keeps them equal).
export const COMPANY_READ_MICROS = 4_000

export const RECENT_MS = 30 * 24 * 60 * 60 * 1000

const companies = (count: number) => `${count} ${count === 1 ? 'company' : 'companies'}`

export const isRecent = (readAt: Date | string | null, now = Date.now()) =>
   readAt !== null && now - new Date(readAt).getTime() < RECENT_MS

// What a read of these will cost: only the reads that will really be charged.
export const readCostLine = (charged: number, recent: number) =>
   [
      `About ${formatUsd(charged * COMPANY_READ_MICROS)} for ${companies(charged)}.`,
      recent > 0 ? `${companies(recent)} read in the last 30 days ${recent === 1 ? 'is' : 'are'} skipped.` : '',
   ]
      .filter(Boolean)
      .join(' ')

export type ReadTotals = { reading: number; readRecently: number; paused: number }

export const readResultLine = ({ reading, readRecently, paused }: ReadTotals) =>
   [
      reading > 0 ? `Reading ${companies(reading)}; they fill in over the next minutes.` : 'Nothing to read.',
      readRecently > 0 ? `${companies(readRecently)} read in the last 30 days skipped.` : '',
      paused > 0
         ? `${companies(paused)} could not start now (reads are paused for a short while); try again later.`
         : '',
   ]
      .filter(Boolean)
      .join(' ')
