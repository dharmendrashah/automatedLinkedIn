import { browserDetection } from './browserDetection'
import { type TaskDefinition } from './defineTask'
import { createLinkedinBrowse } from './linkedinBrowse'
import { createLinkedinLogin } from './linkedinLogin'
import { createLinkedinMessages } from './linkedinMessages'

// What the tasks that need settings are built from. The worker fills it from its environment.
export type TaskConfig = {
   linkedin: Parameters<typeof createLinkedinLogin>[0]
}

// Every task the worker can run. Adding a task is a folder under tasks/ and one line here.
export const buildTasks = (config: TaskConfig): TaskDefinition[] => [
   browserDetection,
   createLinkedinLogin(config.linkedin),
   createLinkedinBrowse({ baseUrl: config.linkedin.baseUrl }),
   createLinkedinMessages({ baseUrl: config.linkedin.baseUrl }),
]
