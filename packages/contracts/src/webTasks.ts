// What the web app may start through `task.run`: tasks that read or sign in. Acts (invite, reply, message, post, comment, answer a
// request, remove a connection) go through their domain services, which keep the limits and the platform kill-switch
// (.plan/004-task-run-read-only.md). A task that is not listed starts closed.
export const WEB_READ_TASKS = [
   'browser-detection',
   'linkedin-login',
   'linkedin-browse',
   'linkedin-messages',
   'linkedin-profile',
   'linkedin-view-profile',
   'linkedin-view-company',
]

// Read and act in one task: the act is the input key listed here; without it the task only reads.
export const WEB_ACT_KEYS: Record<string, string> = {
   'linkedin-invitations': 'answers',
   'linkedin-connections': 'remove',
}

export const WEB_TASK_REFUSED = 'This task acts on LinkedIn, so it cannot be started or run again from here.'

const valueOf = (input: unknown, key: string): unknown =>
   typeof input === 'object' && input !== null ? Object.entries(input).find(([name]) => name === key)?.[1] : undefined

// A sentence when the task, with this input, may not be started from the web; null when it may.
export const webTaskRefusal = (task: string, input: unknown): string | null => {
   if (WEB_READ_TASKS.includes(task)) {
      return null
   }

   const key = WEB_ACT_KEYS[task]

   if (key === undefined) {
      return WEB_TASK_REFUSED
   }

   const value = valueOf(input, key)
   const empty = value === undefined || (Array.isArray(value) && value.length === 0)

   return empty ? null : WEB_TASK_REFUSED
}
