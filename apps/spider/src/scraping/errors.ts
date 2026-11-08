// A task failed for a reason the task itself caused (not allowed, blocked by robots, selector never appeared).
// Retrying cannot help, so the worker reports FAILED and acknowledges. Any other error is an
// infrastructure problem and the message is retried.
export class TaskError extends Error {
   public constructor(message: string) {
      super(message)
      this.name = 'TaskError'
   }
}

// The exit address of a proxy could not be looked up. The task answers PROXY_FAILED; the original error is logged.
export class ProxyLookupError extends TaskError {
   public readonly original: unknown

   public constructor(original: unknown) {
      super('The exit address of the proxy could not be looked up')
      this.original = original
   }
}

// Another task is running for the same account. The task did nothing wrong and is not failed: the consumer
// publishes it again after a short wait, without using up a retry.
export class AccountBusyError extends Error {
   public constructor() {
      super('Another task is running for this account')
      this.name = 'AccountBusyError'
   }
}

// The worker was told to stop before the task could finish. The task did nothing wrong and is not failed: the message goes
// back to the queue at once, without using up a retry, for the next worker to run from the last good profile.
export class ShutdownError extends Error {
   public constructor() {
      super('The worker is stopping')
      this.name = 'ShutdownError'
   }
}
