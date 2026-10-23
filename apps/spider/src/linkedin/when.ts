// The days and times LinkedIn shows in its messages ("Jan 25, 2024", "Jan 16", "Today", "Mon", "5:18 PM"), read in English, the
// language of the accounts' devices. Anything else is left out, and the text as shown is kept next to it.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const pad = (value: number) => String(value).padStart(2, '0')

// A real calendar day as YYYY-MM-DD, or undefined (no 30th of February).
const day = (year: number, month: number, date: number) => {
   const check = new Date(Date.UTC(year, month, date))

   return check.getUTCFullYear() === year && check.getUTCMonth() === month && check.getUTCDate() === date
      ? `${year}-${pad(month + 1)}-${pad(date)}`
      : undefined
}

const daysAgo = (today: Date, back: number) => {
   const past = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - back))

   return day(past.getUTCFullYear(), past.getUTCMonth(), past.getUTCDate())
}

export const parseDay = (text: string, today: Date) => {
   const shown = text.trim().toLowerCase()

   if (shown === 'today') {
      return daysAgo(today, 0)
   }

   if (shown === 'yesterday') {
      return daysAgo(today, 1)
   }

   const weekday = WEEKDAYS.indexOf(shown.slice(0, 3))

   if (weekday >= 0 && /^[a-z]+$/.test(shown) && shown.length >= 3) {
      // The most recent such day before today (LinkedIn says "Today" for today itself).
      const back = ((today.getUTCDay() - weekday + 6) % 7) + 1

      return daysAgo(today, back)
   }

   const found = /^([a-z]{3})[a-z]*\.? (\d{1,2})(?:, (\d{4}))?$/.exec(shown)
   const month = found ? MONTHS.indexOf(found[1] ?? '') : -1

   if (!found || month < 0) {
      return undefined
   }

   const date = Number(found[2])

   if (found[3]) {
      return day(Number(found[3]), month, date)
   }

   // No year: this year's, unless that day has not come yet, then last year's.
   const year = today.getUTCFullYear()
   const thisYear = day(year, month, date)

   return thisYear !== undefined && thisYear > (daysAgo(today, 0) ?? '') ? day(year - 1, month, date) : thisYear
}

export const parseClock = (text: string) => {
   const found = /^(\d{1,2}):(\d{2})(?:\s*([ap])m)?$/i.exec(text.trim())

   if (!found) {
      return undefined
   }

   let hours = Number(found[1])
   const minutes = Number(found[2])
   const half = found[3]?.toLowerCase()

   if (half) {
      if (hours < 1 || hours > 12) {
         return undefined
      }

      hours = (hours % 12) + (half === 'p' ? 12 : 0)
   }

   return hours > 23 || minutes > 59 ? undefined : `${pad(hours)}:${pad(minutes)}`
}
