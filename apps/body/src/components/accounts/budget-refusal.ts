// Whether a failed request was refused because the account may not browse now (its rest between two sessions, its working
// hours or its day), as the server says it.
export const isBudgetRefusal = (error: { data?: { budgetRefusal?: boolean } | null }) =>
   error.data?.budgetRefusal === true
