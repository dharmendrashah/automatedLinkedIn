import {
   TASK_CONTRACT_VERSION,
   type TaskCatalogEntry,
   type TaskCommand,
   type TaskTrigger,
   taskCommandSchema,
} from '@automatedLinkedIn/contracts'

export type CommandParts = {
   id: string
   userId: string
   task: string
   taskVersion: number
   // Exactly the session's `startedAt`: brain checks the files of a result against the folder computed from it.
   requestedAt: Date
   trigger: TaskTrigger
   input: Record<string, unknown>
   needs: TaskCatalogEntry['needs']
   // Forwarded as stored: the worker masks it in every recording and log.
   proxy?: TaskCommand['proxy']
   account?: {
      id: string
      email: string
      secret: string
      secretIv: string
      secretTag: string
      keyVersion: number
   }
}

// The one place a task command is made, for the check at request time and for the publish, so both see the same command.
// Throws a ZodError for a command that can never be published.
export const buildTaskCommand = ({
   id,
   userId,
   task,
   taskVersion,
   requestedAt,
   trigger,
   input,
   needs,
   proxy,
   account,
}: CommandParts): TaskCommand =>
   taskCommandSchema.parse({
      contract: TASK_CONTRACT_VERSION,
      task_id: id,
      user_id: userId,
      task,
      task_version: taskVersion,
      requested_at: requestedAt.toISOString(),
      trigger,
      ...(proxy && { proxy }),
      ...(needs.account &&
         account && {
            account_id: account.id,
            account_email: account.email,
            credentials: {
               ciphertext: account.secret,
               iv: account.secretIv,
               tag: account.secretTag,
               key_version: account.keyVersion,
            },
         }),
      input,
   })
