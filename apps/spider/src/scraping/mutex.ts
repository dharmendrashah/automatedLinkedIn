// Lets one job at a time through. The worker takes scrape tasks and validations from two queues, and each one opens a
// Firefox, so they have to wait for each other.
export class Mutex {
   private tail: Promise<unknown> = Promise.resolve()

   public runExclusive<T>(job: () => Promise<T>): Promise<T> {
      const result = this.tail.then(job)

      // The next job waits for this one to end, however it ends.
      this.tail = result.catch(() => undefined)

      return result
   }
}
