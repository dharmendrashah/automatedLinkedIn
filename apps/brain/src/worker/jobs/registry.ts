import { unique } from '../registry'
import { proxyScoring } from './proxyScoring'
import { retention } from './retention'
import { taskDispatch } from './taskDispatch'
import { dataWallet, workflowEngine } from './workflowEngine'
import { workflowSchedule } from './workflowSchedule'

// Every scheduled job the worker runs. Adding one is a file in this folder and one line here.
export const JOBS = unique('job', [proxyScoring, taskDispatch, workflowEngine, workflowSchedule, dataWallet, retention])
