import { browserDetection } from './browserDetection'
import { type TaskDefinition } from './defineTask'
import { createLinkedinBrowse } from './linkedinBrowse'
import { createLinkedinConnections } from './linkedinConnections'
import { createLinkedinInvitations } from './linkedinInvitations'
import { createLinkedinInvite } from './linkedinInvite'
import { createLinkedinLogin } from './linkedinLogin'
import { createLinkedinMessage } from './linkedinMessage'
import { createLinkedinMessages } from './linkedinMessages'
import { createLinkedinPost } from './linkedinPost'
import { createLinkedinProfile } from './linkedinProfile'
import { createLinkedinReply } from './linkedinReply'
import { createLinkedinViewCompany } from './linkedinViewCompany'
import { createLinkedinViewProfile } from './linkedinViewProfile'

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
   createLinkedinProfile({ baseUrl: config.linkedin.baseUrl }),
   createLinkedinPost({ baseUrl: config.linkedin.baseUrl }),
   createLinkedinReply({ baseUrl: config.linkedin.baseUrl }),
   createLinkedinMessage({ baseUrl: config.linkedin.baseUrl }),
   createLinkedinInvitations({ baseUrl: config.linkedin.baseUrl }),
   createLinkedinConnections({ baseUrl: config.linkedin.baseUrl }),
   createLinkedinInvite({ baseUrl: config.linkedin.baseUrl }),
   createLinkedinViewProfile({ baseUrl: config.linkedin.baseUrl }),
   createLinkedinViewCompany({ baseUrl: config.linkedin.baseUrl }),
]
