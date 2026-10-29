const DAY_START_MINUTE = 8 * 60
const DAY_END_MINUTE = 22 * 60

// The main timezone of the countries proxies are usually in. A country with several zones gets its most populous one: the
// time only has to fall in someone's day, not on the minute.
const COUNTRY_TIMEZONES: Record<string, string> = {
   AE: 'Asia/Dubai',
   AR: 'America/Argentina/Buenos_Aires',
   AT: 'Europe/Vienna',
   AU: 'Australia/Sydney',
   BD: 'Asia/Dhaka',
   BE: 'Europe/Brussels',
   BR: 'America/Sao_Paulo',
   CA: 'America/Toronto',
   CH: 'Europe/Zurich',
   CL: 'America/Santiago',
   CN: 'Asia/Shanghai',
   CO: 'America/Bogota',
   CZ: 'Europe/Prague',
   DE: 'Europe/Berlin',
   DK: 'Europe/Copenhagen',
   EG: 'Africa/Cairo',
   ES: 'Europe/Madrid',
   FI: 'Europe/Helsinki',
   FR: 'Europe/Paris',
   GB: 'Europe/London',
   GR: 'Europe/Athens',
   HK: 'Asia/Hong_Kong',
   HU: 'Europe/Budapest',
   ID: 'Asia/Jakarta',
   IE: 'Europe/Dublin',
   IL: 'Asia/Jerusalem',
   IN: 'Asia/Kolkata',
   IT: 'Europe/Rome',
   JP: 'Asia/Tokyo',
   KE: 'Africa/Nairobi',
   KR: 'Asia/Seoul',
   MX: 'America/Mexico_City',
   MY: 'Asia/Kuala_Lumpur',
   NG: 'Africa/Lagos',
   NL: 'Europe/Amsterdam',
   NO: 'Europe/Oslo',
   NZ: 'Pacific/Auckland',
   PH: 'Asia/Manila',
   PK: 'Asia/Karachi',
   PL: 'Europe/Warsaw',
   PT: 'Europe/Lisbon',
   RO: 'Europe/Bucharest',
   SA: 'Asia/Riyadh',
   SE: 'Europe/Stockholm',
   SG: 'Asia/Singapore',
   TH: 'Asia/Bangkok',
   TR: 'Europe/Istanbul',
   TW: 'Asia/Taipei',
   UA: 'Europe/Kyiv',
   US: 'America/New_York',
   VN: 'Asia/Ho_Chi_Minh',
   ZA: 'Africa/Johannesburg',
}

export const timezoneOfCountry = (code: string | null | undefined) =>
   (code && COUNTRY_TIMEZONES[code.toUpperCase()]) || 'UTC'

// The wall clock of `date` in `timeZone`.
const clockIn = (date: Date, timeZone: string) => {
   const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
   }).formatToParts(date)
   const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(entry => entry.type === type)?.value)

   return {
      year: part('year'),
      month: part('month'),
      day: part('day'),
      minute: part('hour') * 60 + part('minute'),
   }
}

const offsetMs = (date: Date, timeZone: string) => {
   const { year, month, day, minute } = clockIn(date, timeZone)

   return Date.UTC(year, month - 1, day, 0, minute) - Math.floor(date.getTime() / 60_000) * 60_000
}

// The instant a wall clock shows `minute` of that day in `timeZone`. The second pass settles a clock change.
const atClock = (year: number, month: number, day: number, minute: number, timeZone: string) => {
   const wall = Date.UTC(year, month - 1, day, 0, minute)
   const first = wall - offsetMs(new Date(wall), timeZone)

   return new Date(wall - offsetMs(new Date(first), timeZone))
}

// A random minute between 08:00 and 22:00 in `timeZone`: later today when `today` and the day is still open, else tomorrow.
// So a daily run never keeps the same time, and two runs are never more than about two days apart.
export const dailyTime = (
   now: Date,
   timeZone: string,
   { today }: { today: boolean },
   random: () => number = Math.random
) => {
   const clock = clockIn(now, timeZone)
   const start = Math.max(DAY_START_MINUTE, clock.minute + 1)
   const useToday = today && start < DAY_END_MINUTE
   const from = useToday ? start : DAY_START_MINUTE
   const minute = from + Math.floor(random() * (DAY_END_MINUTE - from))

   return atClock(clock.year, clock.month, clock.day + (useToday ? 0 : 1), minute, timeZone)
}

const DAY_READ_EVERY_MS = 30 * 60_000
const NIGHT_READ_EVERY_MS = 2 * 60 * 60_000

// The next message read: 30 minutes on between 08:00 and 22:00 in `timeZone`, 2 hours on at night but never past 08:00.
export const nextMessagesTime = (now: Date, timeZone: string) => {
   const { minute } = clockIn(now, timeZone)

   if (minute >= DAY_START_MINUTE && minute < DAY_END_MINUTE) {
      return new Date(now.getTime() + DAY_READ_EVERY_MS)
   }

   const untilMorningMs = ((DAY_START_MINUTE - minute + 24 * 60) % (24 * 60)) * 60_000

   return new Date(now.getTime() + Math.min(NIGHT_READ_EVERY_MS, untilMorningMs))
}
