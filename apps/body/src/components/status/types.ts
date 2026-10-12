import { type RouterOutputs } from '../../trpc'

export type StatusSnapshot = RouterOutputs['status']['get']
export type ModuleStatus = StatusSnapshot['modules'][number]
export type ModuleState = ModuleStatus['status']
