// A step of browsing that did not work, for a reason that can be said in one safe sentence (never page content or a secret).
// The walk goes on with the next step; any other error is a crash.
export class StepFailed extends Error {
   public constructor(message: string) {
      super(message)
      this.name = 'StepFailed'
   }
}

export const describeError = (error: unknown, fallback: string) =>
   error instanceof StepFailed ? error.message : fallback
