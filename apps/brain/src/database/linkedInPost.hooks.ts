import { type TaskResult, postLinkOf } from '@automatedLinkedIn/contracts'

import { TaskRefusedError } from './taskErrors'
import { type TaskHooks } from './taskHooks'

export const POST_TASK = 'linkedin-post'

const NO_LINK_SENTENCE = 'LinkedIn said the post went but gave no link. Find it in your activity on LinkedIn.'

// The answers after which nothing was posted: ours that say so, and the runner's that end a task before it starts. Any other answer (a
// timeout, a crash, a lost proxy) may have come after Post was pressed, so the post is unsure.
const NOT_POSTED = new Set([
   'FAILED',
   'NO_COMPOSER',
   'WRONG_AUDIENCE',
   'WRONG_COMMENTS',
   'SIGNED_OUT',
   'ERROR',
   'UNKNOWN_TASK',
   'INVALID_INPUT',
   'NEEDS_PROXY',
   'NEEDS_ACCOUNT',
   'NOT_ALLOWED',
   'NOT_QUEUED',
   'CANCELLED',
])

// The address in the task's report, only when it is the address of a post.
const linkOf = (result: TaskResult) =>
   postLinkOf(result.report?.sections.flatMap(({ items }) => items).find(({ label }) => label === 'Link')?.value)

// A post needs a session LinkedIn accepts. The result sets the post from the verdict and keeps its link, and asks for a sign-in check
// when LinkedIn said signed out.
export const linkedInPostHooks: TaskHooks = {
   async onRequest({ accountId }, tx) {
      const account = await tx.linkedInAccount.findUnique({
         where: { id: accountId },
         select: { status: true },
      })

      if (account?.status !== 'ACTIVE') {
         throw new TaskRefusedError('Posting needs an account that is signed in. Run Test login first.')
      }
   },

   async onResult(session, result, tx) {
      const posted = result.verdict === 'POSTED' || result.verdict === 'POSTED_NO_LINK'
      const state = posted ? 'POSTED' : NOT_POSTED.has(result.verdict) ? 'FAILED' : 'UNKNOWN'
      const link = posted ? (linkOf(result) ?? null) : null

      // A post that already shows as posted stays so; one the sweep ended as unsure is set by the real answer.
      await tx.postPublication.updateMany({
         where: {
            sessionId: session.id,
            state: { not: 'POSTED' },
         },
         data: {
            state,
            link,
            failure: posted ? (link ? null : NO_LINK_SENTENCE) : result.message,
            postedAt: posted ? new Date() : null,
         },
      })

      if (result.verdict === 'SIGNED_OUT') {
         await tx.linkedInAccount.updateMany({
            where: {
               id: session.linkedInAccountId,
               status: 'ACTIVE',
            },
            data: { nextCheckAt: new Date() },
         })
      }
   },
}
