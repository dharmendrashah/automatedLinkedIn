import { type Prisma } from 'generated/prisma/client'

import { type TaskResult, type TaskTrigger } from '@automatedLinkedIn/contracts'

import { linkedInBrowseHooks } from './linkedInBrowse.hooks'
import { CONNECTIONS_TASK, linkedInConnectionHooks } from './linkedInConnection.hooks'
import { INVITATIONS_TASK, linkedInInvitationHooks } from './linkedInInvitation.hooks'
import { INVITE_TASK, linkedInInviteHooks } from './linkedInInvite.hooks'
import { linkedInLoginHooks } from './linkedInLogin.hooks'
import { MESSAGES_TASK, linkedInMessagesHooks } from './linkedInMessages.hooks'
import { VIEW_COMPANY_TASK, VIEW_PROFILE_TASK, linkedInVisitHooks } from './linkedInPageVisit.hooks'
import { POST_TASK, linkedInPostHooks } from './linkedInPost.hooks'
import { PROFILE_TASK, linkedInProfileHooks } from './linkedInProfile.hooks'
import { MESSAGE_TASK, REPLY_TASK, linkedInReplyHooks } from './linkedInReply.hooks'

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
   // Throws TaskRefusedError to refuse. Runs inside the transaction that saves the session and its "to publish" row, so a
   // throw leaves nothing behind. Change brain's own data through `tx`, be quick (Prisma's transaction limits apply).
   onRequest?: (context: TaskRequestContext, tx: Prisma.TransactionClient) => Promise<void>
   // Runs inside the transaction that finishes the session, so a hook that throws leaves the session in progress and the
   // result is applied again when it is redelivered. Change brain's own data through `tx`, be quick, and make no network call.
   onResult?: (session: FinishedSession, result: TaskResult, tx: Prisma.TransactionClient) => Promise<void>
}

export const TASK_HOOKS: Record<string, TaskHooks> = {
   'linkedin-login': linkedInLoginHooks,
   'linkedin-browse': linkedInBrowseHooks,
   [MESSAGES_TASK]: linkedInMessagesHooks,
   [PROFILE_TASK]: linkedInProfileHooks,
   [VIEW_PROFILE_TASK]: linkedInVisitHooks,
   [VIEW_COMPANY_TASK]: linkedInVisitHooks,
   [REPLY_TASK]: linkedInReplyHooks,
   [MESSAGE_TASK]: linkedInReplyHooks,
   [INVITATIONS_TASK]: linkedInInvitationHooks,
   [INVITE_TASK]: linkedInInviteHooks,
   [CONNECTIONS_TASK]: linkedInConnectionHooks,
   [POST_TASK]: linkedInPostHooks,
}
