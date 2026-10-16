import { unique } from '../registry'
import { proxyScoring } from './proxyScoring'
import { taskDispatch } from './taskDispatch'

// Every scheduled job the worker runs. Adding one is a file in this folder and one line here.
export const JOBS = unique('job', [proxyScoring, taskDispatch])
