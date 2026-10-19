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
