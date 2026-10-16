import { type TaskResult } from '@automatedLinkedIn/contracts'

import { SpiderSessionService } from './spiderSession.service'
import { TASK_HOOKS } from './taskHooks'

// Finishes the session of a task and runs the hook of its task in the same transaction. Resolves to whether this answer was
// the one that ended the session.
export const applyTaskResult = async (result: TaskResult) => {
   const session = await SpiderSessionService.finishTask(
      result,
      (finished, tx) => TASK_HOOKS[result.task]?.onResult?.(finished, result, tx) ?? Promise.resolve()
   )

   return session !== null
}
