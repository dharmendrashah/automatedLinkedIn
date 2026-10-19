import { describeError } from './errors'

type Run<Target> = {
   targets: Target[]
   // Does one target and says whether it came to something.
   step: (target: Target) => Promise<boolean>
   // Gets the browser back to a page the next target can start from, after a step failed.
   recover: () => Promise<void>
   // The pause between two targets.
   between: () => Promise<void>
   elapsed: () => number
   // No new target is begun after this much time, nor after this many in a row that came to nothing.
   budgetMs: number
   maxFailuresInARow: number
   // An error that ends the whole run instead of one target (a session that was lost).
   isFatal: (error: unknown) => boolean
   warn: (message: string) => void
   says: {
      stepStopped: string
      notRecovered: string
   }
}

// The loop of a walk: target after target, within a time budget, stopping when something is wrong that more clicks will not
// mend. It says how many targets came to something.
export const runTargets = async <Target>(run: Run<Target>) => {
   const { targets, step, recover, between, elapsed, budgetMs, maxFailuresInARow, isFatal, warn, says } = run
   let done = 0
   let inARow = 0

   for (const target of targets) {
      if (elapsed() > budgetMs || inARow >= maxFailuresInARow) {
         break
      }

      try {
         if (await step(target)) {
            done += 1
            inARow = 0
         } else {
            inARow += 1
         }
      } catch (error) {
         if (isFatal(error)) {
            throw error
         }

         warn(describeError(error, says.stepStopped))
         inARow += 1

         try {
            await recover()
         } catch (again) {
            if (isFatal(again)) {
               throw again
            }

            warn(says.notRecovered)
         }
      }

      await between()
   }

   return done
}
