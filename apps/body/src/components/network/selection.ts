import { type AnswerAsk, type NetworkRequest } from './types'

// How many requests of one account may be chosen at once: a run's share, and never more than that account's day has left.
export type CapOf = (accountId: string) => number

// A request can be chosen only while it waits for the owner.
export const canChoose = (request: NetworkRequest) => request.state === 'WAITING'

// How many of the chosen requests belong to each account.
export const chosenCounts = (chosen: string[], requests: NetworkRequest[]) => {
   const counts = new Map<string, number>()
   const ids = new Set(chosen)

   for (const { id, accountId } of requests) {
      if (ids.has(id)) {
         counts.set(accountId, (counts.get(accountId) ?? 0) + 1)
      }
   }

   return counts
}

// Chooses the request, or takes it back when it is chosen already. Past the cap of its account nothing more is added; the limits are
// per account, so a request of another account is still free to choose.
export const toggleChoice = (chosen: string[], request: NetworkRequest, requests: NetworkRequest[], capOf: CapOf) => {
   if (chosen.includes(request.id)) {
      return chosen.filter(other => other !== request.id)
   }

   return (chosenCounts(chosen, requests).get(request.accountId) ?? 0) >= capOf(request.accountId)
      ? chosen
      : [...chosen, request.id]
}

// What is still chosen once the list changed: a request that left, or is being answered, is no longer chosen. Also what a lower cap
// allows, account by account.
export const stillChosen = (chosen: string[], requests: NetworkRequest[], capOf: CapOf) => {
   const waiting = new Map(requests.filter(canChoose).map(request => [request.id, request]))
   const used = new Map<string, number>()

   return chosen.filter(id => {
      const request = waiting.get(id)

      if (!request) {
         return false
      }

      const count = (used.get(request.accountId) ?? 0) + 1

      used.set(request.accountId, count)

      return count <= capOf(request.accountId)
   })
}

// The first requests that wait, up to the cap of each account, for "choose all".
export const firstWaiting = (requests: NetworkRequest[], capOf: CapOf) => {
   const used = new Map<string, number>()

   return requests.filter(canChoose).flatMap(({ id, accountId }) => {
      const count = (used.get(accountId) ?? 0) + 1

      used.set(accountId, count)

      return count <= capOf(accountId) ? [id] : []
   })
}

// Why no more can be chosen for an account, or undefined while there is room.
export const fullReason = (count: number, cap: number, answersLeft: number) => {
   if (count < cap) {
      return undefined
   }

   if (cap === 0) {
      return 'This account has used its answers for today. It can answer again tomorrow.'
   }

   return answersLeft < 10 ? `This account can answer ${answersLeft} more today.` : `At most ${cap} at a time.`
}

// The chosen requests as the asks of each account, in the order of their first request: the limits and the runs are per account.
export const answersByAccount = (asks: Array<AnswerAsk & { accountId: string }>) => {
   const groups = new Map<string, AnswerAsk[]>()

   for (const { accountId, id, action } of asks) {
      groups.set(accountId, [...(groups.get(accountId) ?? []), { id, action }])
   }

   return [...groups].map(([accountId, list]) => ({
      accountId,
      asks: list,
   }))
}
