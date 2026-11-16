// Whether a finished task run may be run again from the Sessions drawer. Body cannot import values from the CommonJS contracts
// package, so this copies `webTaskRefusal` (contracts `webTasks.ts`); web-tasks.unit.test.ts fails when they drift.
const READ_TASKS = [
   'browser-detection',
   'linkedin-login',
   'linkedin-browse',
   'linkedin-messages',
   'linkedin-profile',
   'linkedin-view-profile',
   'linkedin-view-company',
]

const ACT_KEYS: Record<string, string> = {
   'linkedin-invitations': 'answers',
   'linkedin-connections': 'remove',
}

export const WEB_TASK_REFUSED = 'This task acts on LinkedIn, so it cannot be started or run again from here.'

const valueOf = (input: unknown, key: string): unknown =>
   typeof input === 'object' && input !== null ? Object.entries(input).find(([name]) => name === key)?.[1] : undefined

export const webTaskRefusal = (task: string, input: unknown): string | null => {
   if (READ_TASKS.includes(task)) {
      return null
   }

   const key = ACT_KEYS[task]

   if (key === undefined) {
      return WEB_TASK_REFUSED
   }

   const value = valueOf(input, key)
   const empty = value === undefined || (Array.isArray(value) && value.length === 0)

   return empty ? null : WEB_TASK_REFUSED
}
