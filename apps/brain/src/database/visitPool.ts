// The accounts, the one that went longest without a visit first (one that never visited comes before any), and the order
// they were listed in for a tie.
export const idleFirst = (accountIds: string[], lastVisit: Map<string, Date>) =>
   accountIds
      .map((id, index) => ({
         id,
         index,
         at: lastVisit.get(id)?.getTime() ?? Number.NEGATIVE_INFINITY,
      }))
      .sort((left, right) => (left.at === right.at ? left.index - right.index : left.at < right.at ? -1 : 1))
      .map(({ id }) => id)
