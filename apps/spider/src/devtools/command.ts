import { randomUUID } from 'node:crypto'

import {
   type ProxyConfig,
   type Sealed,
   TASK_CONTRACT_VERSION,
   type TaskCommand,
   taskCommandSchema,
} from '@automatedLinkedIn/contracts'

type CommandParts = {
   task: { name: string; version: number }
   input: Record<string, unknown>
   proxy?: ProxyConfig
   account?: { id: string; email: string; secret: Sealed }
}

// The command brain would queue for a manual run, so the real runner and schema check it the same way. The proxy and the
// account only appear when they were chosen.
export const buildCommand = ({ task, input, proxy, account }: CommandParts): TaskCommand =>
   taskCommandSchema.parse({
      contract: TASK_CONTRACT_VERSION,
      task_id: randomUUID(),
      user_id: 'devtools',
      task: task.name,
      task_version: task.version,
      requested_at: new Date().toISOString(),
      trigger: 'manual',
      input,
      ...(proxy && { proxy }),
      ...(account && {
         account_id: account.id,
         account_email: account.email,
         credentials: account.secret,
      }),
   })
