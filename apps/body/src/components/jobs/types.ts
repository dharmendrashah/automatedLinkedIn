import { type RouterOutputs } from '../../trpc'

export type JobsOverview = RouterOutputs['jobs']['overview']
export type Job = JobsOverview['jobs'][number]
export type RunSummary = RouterOutputs['jobs']['runs']['runs'][number]
export type RunDetail = RouterOutputs['jobs']['run']
export type MessageRead = RouterOutputs['jobs']['messageReads'][number]
