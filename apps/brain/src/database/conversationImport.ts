// Pure rules of storing a messages file (.plan/unibox-backend.md). The times LinkedIn showed are the account's own wall-clock, so they
// are kept as if they were UTC: their order and time of day are true, and nothing compares them with the real clock.

const MINUTE_MS = 60_000

export const wallClock = (date: string | undefined, time: string | undefined) => {
   if (!date) {
      return undefined
   }

   const parsed = new Date(`${date}T${time ?? '00:00'}:00.000Z`)

   return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

// The time of every message, in the order of the file. One with no time is a minute after the one before (or after `base` when it
// is the first), and a time never goes back: LinkedIn shows the time of a group once, so a later one with an earlier time is a
// misreading and sits with the one before.
export const timelineOf = (messages: Array<{ date?: string | undefined; time?: string | undefined }>, base: Date) => {
   const times: Date[] = []

   for (const message of messages) {
      const before = times.at(-1)
      const known = wallClock(message.date, message.time)
      const next = known ?? new Date((before ?? base).getTime() + MINUTE_MS)

      times.push(before && next < before ? before : next)
   }

   return times
}

type Timed = {
   direction: 'ME' | 'THEM'
   sentAt: Date
}

// What the list needs about a conversation, from its messages oldest first. They wait since the first of the last run of their
// messages, the way the page counts it.
export const summaryOf = (messages: Timed[]) => {
   const last = messages.at(-1)

   if (!last) {
      return {
         messageCount: 0,
         lastMessageAt: null,
         lastDirection: null,
         waitingSince: null,
         lastReplyAt: null,
      }
   }

   let since = messages.length - 1

   while (last.direction === 'THEM' && since > 0 && messages[since - 1]?.direction === 'THEM') {
      since -= 1
   }

   return {
      messageCount: messages.length,
      lastMessageAt: last.sentAt,
      lastDirection: last.direction,
      waitingSince: last.direction === 'THEM' ? (messages[since]?.sentAt ?? null) : null,
      lastReplyAt: messages.findLast(message => message.direction === 'ME')?.sentAt ?? null,
   }
}
