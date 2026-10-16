import { unique } from '../registry'
import { proxyScoring } from './proxyScoring'

// Every scheduled job the worker runs. Adding one is a file in this folder and one line here.
export const JOBS = unique('job', [proxyScoring])
