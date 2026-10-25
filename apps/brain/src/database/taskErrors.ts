// A request that is refused, with the reason in words the owner can read.
export class TaskRefusedError extends Error {}

export class TaskUnavailableError extends TaskRefusedError {
   public constructor() {
      super('This task is not available.')
   }
}

// The task needs a proxy that works and the account has none.
export class TaskNeedsProxyError extends TaskRefusedError {
   public constructor() {
      super('Test the proxy first: this task needs a working proxy.')
   }
}

export class TaskOwnershipError extends Error {
   public constructor() {
      super('That LinkedIn account was not found.')
   }
}

// The task ran a moment ago. The owner may run it again after confirming; an automatic request never can.
export class TaskRecentError extends TaskRefusedError {}

// An automatic request that does not apply right now. Not a failure, so it is never logged.
export class TaskSkippedError extends TaskRefusedError {}

// The account cannot take the task yet: it is not signed in. Test login and the sign-in check fix it, waiting does not.
export class AccountNotReadyError extends TaskRefusedError {}

// The same task is still running for this scope. Waiting solves it, so a caller that can wait does.
export class TaskBusyError extends TaskRefusedError {}

// The account has used the browsing time it may use now (.plan/account-browsing-budget.md). `until` is when it may be asked again,
// so a caller that can wait (a workflow) waits that long instead of asking again and again.
export class BrowseBudgetError extends TaskRefusedError {
   public readonly reason: 'OUTSIDE_OFFICE' | 'DAY_FULL' | 'BACKGROUND_FULL' | 'TOO_SOON' | 'GAP'
   public readonly until: Date
   // `until` as the owner reads it, in the account's zone: "tomorrow at 09:12".
   public readonly when: string

   public constructor(message: string, reason: BrowseBudgetError['reason'], until: Date, when: string) {
      super(message)
      this.name = 'BrowseBudgetError'
      this.reason = reason
      this.until = until
      this.when = when
   }
}
