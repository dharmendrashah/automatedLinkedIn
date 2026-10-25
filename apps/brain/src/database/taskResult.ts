import { type TaskResult } from '@automatedLinkedIn/contracts'

import { BrowseBudgetService } from './browseBudget.service'
import { SpiderSessionService } from './spiderSession.service'
import { TASK_HOOKS } from './taskHooks'

// Finishes the session of a task and runs the hook of its task in the same transaction. Resolves to whether this answer was
// the one that ended the session.
export const applyTaskResult = async (result: TaskResult) => {
   const session = await SpiderSessionService.finishTask(result, async (finished, tx) => {
      await BrowseBudgetService.settle(tx, finished.id, result)
      await TASK_HOOKS[result.task]?.onResult?.(finished, result, tx)
   })

   return session !== null
}
