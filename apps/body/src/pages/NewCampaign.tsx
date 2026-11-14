import { AllFields } from '@/components/campaigns/outreach-chat/AllFields'
import { OutreachChat } from '@/components/campaigns/outreach-chat/OutreachChat'
import type { Lists } from '@/components/campaigns/outreach-chat/StepInput'
import { clearDraft, freshDraft, loadDraft, saveDraft } from '@/components/campaigns/outreach-chat/draft'
import {
   type Form,
   STEPS,
   type StepId,
   answersOf,
   isComplete,
   nextStep,
   reconcile,
   resetStep,
   stepProblems,
   suggestedPostsOf,
} from '@/components/campaigns/outreach-chat/steps'
import { Button } from '@/components/ui/button'
import { browserTimeZone } from '@/components/workflows/schedule-text'
import { readableError } from '@/lib/trpc-error'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

import { outreachAnswersSchema } from '@automatedLinkedIn/contracts'

import { trpc } from '../trpc'

// A chat that makes a campaign (.plan/campaign-outreach-chat-onboarding.md, .plan/campaign-create-in-chat.md,
// .plan/campaign-create-without-review.md): a name, then either an empty campaign or the six workflows of the outreach pipeline,
// switched off. There is no review: the last answer makes the campaign and opens its page. The answers are kept in sessionStorage
// until the campaign is made.
export const NewCampaign = () => {
   const navigate = useNavigate()
   const utils = trpc.useUtils()
   const timeZone = browserTimeZone()
   const accounts = trpc.linkedInAccount.list.useQuery(undefined, { retry: false })
   const icps = trpc.icp.list.useQuery(undefined, { retry: false })
   const [draft, setDraft] = useState(() => loadDraft(timeZone))
   const [mode, setMode] = useState<'chat' | 'form'>('chat')
   const [notice, setNotice] = useState<string | null>(null)

   const forget = (id: StepId) => setDraft(current => ({ ...current, done: current.done.filter(each => each !== id) }))
   // A failure shows its sentence; a name or label already taken also goes back to the name question, with every answer kept.
   const failed = (error: { message: string; data?: { code?: string } | null }) => {
      if (error.data?.code === 'CONFLICT') {
         forget('name')
         setMode('chat')
      }

      setNotice(readableError(error))
   }
   const opened = async (id: string) => {
      clearDraft()
      await utils.campaign.list.invalidate()
      void navigate(`/campaigns/${id}`)
   }
   const create = trpc.campaign.createOutreach.useMutation({
      onSuccess: made => opened(made.campaignId),
      onError: failed,
   })
   // "No" at the kind question: an empty campaign with the typed name.
   const createEmpty = trpc.campaign.create.useMutation({
      onSuccess: made => opened(made.id),
      onError: failed,
   })

   const accountList = accounts.data ?? []
   const signedInIds = accountList.filter(({ status }) => status === 'ACTIVE').map(({ id }) => id)
   const form = reconcile(draft.form, {
      accountIds: accounts.data ? accountList.map(({ id }) => id) : null,
      icpIds: icps.data ? icps.data.map(({ id }) => id) : null,
   })
   const { used, suggested } = suggestedPostsOf(form, signedInIds)
   // A step whose answer no longer holds (an account was removed, say) is asked again.
   const done = draft.done.filter(id => stepProblems(id, form, suggested).length === 0)
   const current = nextStep(done)
   const lists: Lists = {
      accounts: accountList,
      accountsState: accounts.isError ? 'error' : accounts.data ? 'ready' : 'loading',
      icps: icps.data ?? [],
      icpsFailed: icps.isError,
   }
   const parsed = outreachAnswersSchema.safeParse(answersOf(form, suggested))
   const problems = parsed.success ? [] : [...new Set(parsed.error.issues.map(({ message }) => message))]
   const busy = create.isPending || createEmpty.isPending

   useEffect(() => saveDraft({ form, done: draft.done }), [form, draft.done])

   const set = (patch: Partial<Form>) => setDraft(c => ({ ...c, form: { ...c.form, ...patch } }))
   // Makes the campaign once the answers are all in and valid; never twice at the same time.
   const makeIfComplete = (nextForm: Form, nextDone: StepId[]) => {
      const answered = suggestedPostsOf(nextForm, signedInIds).suggested
      const result = outreachAnswersSchema.safeParse(answersOf(nextForm, answered))

      if (!busy && isComplete(nextDone, nextForm, answered) && result.success) {
         create.mutate(result.data)
      }
   }
   const finish = (id: StepId, patch: Partial<Form> = {}) => {
      setNotice(null)
      setDraft(c => ({ form: { ...c.form, ...patch }, done: c.done.includes(id) ? c.done : [...c.done, id] }))
      makeIfComplete({ ...form, ...patch }, [...new Set([...done, id])])
   }
   const skip = (id: StepId) => {
      setNotice(null)
      setDraft(c => ({ form: resetStep(c.form, id, timeZone), done: c.done.includes(id) ? c.done : [...c.done, id] }))
      makeIfComplete(resetStep(form, id, timeZone), [...new Set([...done, id])])
   }
   const startOver = () => {
      clearDraft()
      setNotice(null)
      setDraft(freshDraft(timeZone))
   }

   if (mode === 'chat') {
      return (
         <OutreachChat
            form={form}
            set={set}
            done={done}
            current={current}
            lists={lists}
            suggested={suggested}
            used={used}
            notice={notice}
            onDone={finish}
            onSkip={skip}
            onReopen={forget}
            onEditAll={form.outreach ? () => setMode('form') : undefined}
            onStartOver={startOver}
            onEmpty={() => createEmpty.mutate({ name: form.name })}
            onCreate={() => (parsed.success ? create.mutate(parsed.data) : undefined)}
            busy={busy}
         />
      )
   }

   return (
      <div className="grid w-full gap-4 px-4 lg:px-6">
         <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Edit all fields</h2>
            <div className="flex gap-2">
               <Button variant="outline" size="sm" onClick={() => setMode('chat')}>
                  Back to the chat
               </Button>
               <Button variant="ghost" size="sm" onClick={startOver}>
                  Start over
               </Button>
            </div>
         </div>
         <AllFields
            form={form}
            set={set}
            lists={lists}
            suggested={suggested}
            used={used}
            problems={problems}
            error={notice}
            busy={busy}
            onCreate={() => {
               setNotice(null)
               setDraft(c => ({ ...c, done: STEPS.map(({ id }) => id) }))

               if (parsed.success) {
                  create.mutate(parsed.data)
               }
            }}
         />
      </div>
   )
}
