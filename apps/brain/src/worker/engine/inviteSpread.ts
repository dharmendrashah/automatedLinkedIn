// Gives each person to the account that has the most room left, one by one in the order they come, so the accounts take people in
// proportion to their room and the best people go first. People that no room holds are returned apart.
export const spreadByRoom = <T>(people: T[], rooms: Array<{ accountId: string; within: number }>) => {
   const left = new Map(rooms.map(({ accountId, within }) => [accountId, within]))
   const given = new Map<string, T[]>(rooms.map(({ accountId }) => [accountId, []]))
   const over: T[] = []

   for (const person of people) {
      let best: string | undefined

      for (const [accountId, room] of left) {
         if (room > 0 && (best === undefined || room > (left.get(best) ?? 0))) {
            best = accountId
         }
      }

      if (best === undefined) {
         over.push(person)
      } else {
         given.get(best)?.push(person)
         left.set(best, (left.get(best) ?? 0) - 1)
      }
   }

   return {
      given,
      over,
   }
}
