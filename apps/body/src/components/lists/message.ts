// The first message to someone found by a workflow: a fixed template filled from their strongest signal. It never
// quotes their own words back, and nothing here sends anything.

type Signal = {
   type: 'commented' | 'reacted' | 'employee' | 'hiring'
   via: string
   at: string | null
   excerpt: string | null
}

type Person = { name: string | null; company: string | null; signals: Signal[] }

const RANK: Record<Signal['type'], number> = {
   commented: 0,
   hiring: 1,
   reacted: 2,
   employee: 3,
}

const STALE_MS = 30 * 24 * 60 * 60 * 1000
const CLOSE = 'Would you be open to a quick chat?'

const timeOf = (signal: Signal) => (signal.at ? new Date(signal.at).getTime() || 0 : 0)

// A comment beats hiring, a reaction and working at a target company; among equals the newest wins.
export const strongestSignal = (signals: Signal[]) =>
   [...signals].sort((a, b) => RANK[a.type] - RANK[b.type] || timeOf(b) - timeOf(a))[0]

// True when the strongest signal has a date older than 30 days, so the opener would feel late.
export const staleSignal = (signals: Signal[], now: Date = new Date()) => {
   const strongest = strongestSignal(signals)

   return Boolean(strongest?.at) && now.getTime() - (strongest ? timeOf(strongest) : 0) > STALE_MS
}

const opening = (signal: Signal | undefined, company: string | null) => {
   if (signal?.type === 'commented') {
      return 'I saw your comment on a recent LinkedIn post and wanted to reach out.'
   }

   if (signal?.type === 'hiring') {
      return `I noticed ${company ?? 'your team'} is hiring${signal.excerpt ? ` for ${signal.excerpt}` : ''}.`
   }

   if (signal?.type === 'reacted') {
      return 'I saw you engaged with a recent LinkedIn post and wanted to reach out.'
   }

   return company && signal
      ? `I came across ${company} and wanted to reach out.`
      : 'I came across your profile and wanted to reach out.'
}

export const messageFor = ({ name, company, signals }: Person) => {
   const first = name?.trim().split(/\s+/)[0] || 'there'

   return `Hi ${first}, ${opening(strongestSignal(signals), company)} ${CLOSE}`
}
