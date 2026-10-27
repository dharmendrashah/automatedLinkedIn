import { type NetworkRequest } from './types'

// A request can be chosen only while it waits for the owner.
export const canChoose = (request: NetworkRequest) => request.state === 'WAITING'

// Chooses the request, or takes it back when it is chosen already. Past the cap nothing more is added.
export const toggleChoice = (chosen: string[], id: string, cap: number) => {
   if (chosen.includes(id)) {
      return chosen.filter(other => other !== id)
   }

   return chosen.length >= cap ? chosen : [...chosen, id]
}

// What is still chosen once the list changed: a request that left, or is being answered, is no longer chosen. Also what a lower
// cap allows.
export const stillChosen = (chosen: string[], requests: NetworkRequest[], cap: number) => {
   const waiting = new Set(requests.filter(canChoose).map(({ id }) => id))

   return chosen.filter(id => waiting.has(id)).slice(0, cap)
}

// The first requests that wait, up to the cap, for "Choose the first 10".
export const firstWaiting = (requests: NetworkRequest[], cap: number) =>
   requests
      .filter(canChoose)
      .slice(0, cap)
      .map(({ id }) => id)

// Why no more can be chosen, or undefined while there is room.
export const fullReason = (count: number, cap: number, answersLeft: number) => {
   if (count < cap) {
      return undefined
   }

   if (cap === 0) {
      return 'This account has used its answers for today. It can answer again tomorrow.'
   }

   return answersLeft < 10 ? `This account can answer ${answersLeft} more today.` : `At most ${cap} at a time.`
}
