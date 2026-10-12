import { type TaskResult, type TaskTrigger } from '@automatedLinkedIn/contracts'

// Where a task needs brain to do something of its own: refuse a request for a reason only brain knows, or change brain's own
// data when the result arrives. Most tasks have no hook. One file lists them all, by task name.
export type TaskRequestContext = {
   // The session the request is about to create.
   id: string
   userId: string
   accountId: string
   proxyId?: string
   task: string
   trigger: TaskTrigger
}

export type FinishedSession = {
   id: string
   userId: string
   linkedInAccountId: string
}

export type TaskHooks = {
   // Throws TaskRefusedError to refuse, before anything is saved or queued.
   onRequest?: (context: TaskRequestContext) => Promise<void>
   // Runs once, after the session was finished by this very result.
   onResult?: (session: FinishedSession, result: TaskResult) => Promise<void>
}

export const TASK_HOOKS: Record<string, TaskHooks> = {}
