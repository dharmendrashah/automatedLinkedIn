import { type StandardTaskCommand } from '@automatedLinkedIn/contracts'

import { type BrowserTestDeps, processBrowserDetection } from './processBrowserDetection'

// The standard task list: each task name the contracts allow maps to the code that runs it. A new task is a new entry here
// and a new member of the command union.
export type StandardTaskDeps = BrowserTestDeps

const handlers: {
   [T in StandardTaskCommand['task']]: (
      command: Extract<StandardTaskCommand, { task: T }>,
      deps: StandardTaskDeps
   ) => Promise<void>
} = { browser_detection: processBrowserDetection }

export const runStandardTask = (command: StandardTaskCommand, deps: StandardTaskDeps) =>
   handlers[command.task](command, deps)
