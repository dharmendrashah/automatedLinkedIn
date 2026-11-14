import { REPLY_VALUE_MAX_USD } from '@automatedLinkedIn/contracts'

const usd = new Intl.NumberFormat('en-US', {
   style: 'currency',
   currency: 'USD',
   maximumFractionDigits: 0,
})

// Whole dollars: "$12,000".
export const formatPipelineUsd = (value: number) => usd.format(value)

// The sum in words, so the number is never a mystery: "10 positive replies x $100 a month x 12".
export const formulaText = (replies: number, monthlyUsd: number) =>
   `${replies} positive ${replies === 1 ? 'reply' : 'replies'} x ${formatPipelineUsd(monthlyUsd)} a month x 12`

// What the owner typed for the worth of one reply: a whole number of USD a month, nothing to clear it, or not valid.
export const parseWorth = (text: string): number | null | 'invalid' => {
   const typed = text.trim().replace(/^\$/, '').replaceAll(',', '')

   if (typed === '') {
      return null
   }

   const value = Number(typed)

   return Number.isInteger(value) && value >= 1 && value <= REPLY_VALUE_MAX_USD ? value : 'invalid'
}

// Where the counted replies came from, in one line: "3 detected by rules, 2 by AI, 5 marked by you".
export const sourceLine = ({ rules, ai, marked }: { rules: number; ai: number; marked: number }) =>
   [
      rules > 0 ? `${rules} detected by rules` : '',
      ai > 0 ? `${ai} detected by AI` : '',
      marked > 0 ? `${marked} marked by you` : '',
   ]
      .filter(Boolean)
      .join(', ')
