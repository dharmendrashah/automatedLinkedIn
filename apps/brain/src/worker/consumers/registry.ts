import { unique } from '../registry'
import { taskCatalog } from './taskCatalog'
import { taskResults } from './taskResults'

// Every queue the worker consumes. Adding one is a file in this folder and one line here.
export const CONSUMERS = unique('consumer', [taskResults, taskCatalog])
