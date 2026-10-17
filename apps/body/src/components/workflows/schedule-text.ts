import { type ConfigValue } from './types'

// Plain words for a schedule, and the time zones it can run in.

type Values = Record<string, ConfigValue | undefined>

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

// "Asia/Kolkata" reads as "Kolkata".
export const cityOf = (timeZone: string) => (timeZone.split('/').pop() ?? timeZone).replaceAll('_', ' ')

// "09:00" reads as "9:00 AM".
export const clockText = (time: string) => {
   const [hour = 0, minute = 0] = time.split(':').map(Number)
   const suffix = hour < 12 ? 'AM' : 'PM'

   return `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, '0')} ${suffix}`
}

const ordinal = (day: number) => {
   const tens = day % 100

   if (tens >= 11 && tens <= 13) {
      return `${day}th`
   }

   return `${day}${['th', 'st', 'nd', 'rd'][day % 10] ?? 'th'}`
}

const listOf = (names: string[]) =>
   names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

const text = (values: Values, key: string, fallback: string) => {
   const value = values[key]

   return typeof value === 'string' ? value : fallback
}

const number = (values: Values, key: string, fallback: number) => {
   const value = values[key]

   return typeof value === 'number' ? value : fallback
}

// The days a weekly schedule runs on; schedules saved before kept one `weekday`.
export const daysOf = (values: Values) => {
   const days = values.days

   return Array.isArray(days) && days.length > 0 ? days.map(Number) : [number(values, 'weekday', 1)]
}

// One sentence a non-technical owner can check, such as "Every Monday and Thursday at 9:00 AM, Kolkata time".
export const describeSchedule = (values: Values) => {
   const at = clockText(text(values, 'at', '09:00'))
   const zone = `${cityOf(text(values, 'timeZone', 'UTC'))} time`

   switch (values.every) {
      case 'hours': {
         const hours = number(values, 'hours', 24)
         const window =
            values.between === true
               ? `, between ${clockText(text(values, 'from', '09:00'))} and ${clockText(text(values, 'until', '18:00'))}`
               : ''
         const days = values.weekdaysOnly === true ? ', Monday to Friday' : ''

         return `Every ${hours === 1 ? 'hour' : `${hours} hours`}${window}${days}, ${zone}`
      }
      case 'weekdays':
         return `Every weekday (Monday to Friday) at ${at}, ${zone}`
      case 'week':
         return `Every ${listOf(daysOf(values).map(day => WEEKDAY_NAMES[day] ?? ''))} at ${at}, ${zone}`
      case 'month':
         return `On the ${ordinal(number(values, 'dayOfMonth', 1))} of every month at ${at}, ${zone}`
      default:
         return `Every day at ${at}, ${zone}`
   }
}

// The zone's offset now, such as "GMT+5:30".
export const offsetOf = (timeZone: string, now = new Date()) =>
   new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
   })
      .formatToParts(now)
      .find(({ type }) => type === 'timeZoneName')?.value ?? ''

export const allTimeZones = () => Intl.supportedValuesOf('timeZone')
