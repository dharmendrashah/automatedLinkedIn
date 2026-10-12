import { browserDetection } from './browserDetection'
import { type TaskDefinition } from './defineTask'

// Every task the worker can run. Adding a task is a folder under tasks/ and one line here.
export const TASKS: TaskDefinition[] = [browserDetection]
