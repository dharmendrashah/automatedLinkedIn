import { type UniboxMessage } from './types'

import { dayLabel, sameDay } from './time'

export type Group = {
   direction: 'ME' | 'THEM'
   sender: string
   at: number
   messages: UniboxMessage[]
}

export type Day = {
   label: string
   at: number
   groups: Group[]
}

// More silence than this between two messages of one sender starts a new group (and shows the time again).
const GROUP_GAP_MS = 2 * 3_600_000

// A conversation as it is drawn: days, and in each day the runs of messages of one sender, so the name and the time are said once.
export const buildThread = (messages: UniboxMessage[], now: number): Day[] => {
   const days: Day[] = []

   for (const message of messages) {
      let day = days.at(-1)

      if (!day || !sameDay(day.at, message.at)) {
         day = {
            label: dayLabel(message.at, now),
            at: message.at,
            groups: [],
         }
         days.push(day)
      }

      const group = day.groups.at(-1)
      const previous = group?.messages.at(-1)

      if (
         group &&
         previous &&
         group.direction === message.direction &&
         group.sender === message.sender &&
         message.at - previous.at < GROUP_GAP_MS
      ) {
         group.messages.push(message)
      } else {
         day.groups.push({
            direction: message.direction,
            sender: message.sender,
            at: message.at,
            messages: [message],
         })
      }
   }

   return days
}

export const lastOwnIndex = (messages: UniboxMessage[]) => messages.findLastIndex(message => message.direction === 'ME')
