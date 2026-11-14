import { AllFields } from '@/components/campaigns/outreach-chat/AllFields'
import { OutreachChat } from '@/components/campaigns/outreach-chat/OutreachChat'
import type { Lists } from '@/components/campaigns/outreach-chat/StepInput'
import { clearDraft, freshDraft, loadDraft, saveDraft } from '@/components/campaigns/outreach-chat/draft'
import {
   type Form,
   STEPS,
   type StepId,
   answersOf,
   nextStep,
   reconcile,
   resetStep,
   stepProblems,
   suggestedPostsOf,
} from '@/components/campaigns/outreach-chat/steps'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { browserTimeZone } from '@/components/workflows/schedule-text'
import { readableError } from '@/lib/trpc-error'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

import { STAGE_LABELS, buildOutreach, capacityOf, outreachAnswersSchema } from '@automatedLinkedIn/contracts'

import { trpc } from '../trpc'

// A chat that builds the six workflows of the outreach pipeline, switched off (.plan/campaign-outreach-chat-onboarding.md,
// .plan/lead-pipeline-p6-campaign-starter.md). Plain words, safe defaults; nothing here names a block or a threshold. The review
// shows what will be made before anything is. The answers are kept in sessionStorage until the campaign is created.
export const NewCampaign = () => {
   const navigate = useNavigate()
   const timeZone = browserTimeZone()
   const accounts = trpc.linkedInAccount.list.useQuery(undefined, { retry: false })
   const icps = trpc.icp.list.useQuery(undefined, { retry: false })
   const [draft, setDraft] = useState(() => loadDraft(timeZone))
   const [mode, setMode] = useState<'chat' | 'form'>('chat')
   const [notice, setNotice] = useState<string | null>(null)

   const forget = (id: StepId) => setDraft(current => ({ ...current, done: current.done.filter(each => each !== id) }))
   const create = trpc.campaign.createOutreach.useMutation({
      onSuccess: made => {
         clearDraft()
         void navigate(`/campaigns/${made.campaignId}`)
      },
      onError: error => {
         // A name or label already taken: back to the name question, with every answer kept.
         if (error.data?.code === 'CONFLICT') {
            forget('name')
            setNotice(readableError(error))
         }
      },
   })

   const accountList = accounts.data ?? []
   const form = reconcile(draft.form, {
      accountIds: accounts.data ? accountList.map(({ id }) => id) : null,
      icpIds: icps.data ? icps.data.map(({ id }) => id) : null,
   })
   const { used, suggested } = suggestedPostsOf(
      form,
      accountList.filter(({ status }) => status === 'ACTIVE').map(({ id }) => id)
   )
   // A step whose answer no longer holds (an account was removed, say) is asked again.
   const done = draft.done.filter(id => stepProblems(id, form, suggested).length === 0)
   const current = nextStep(done)
   const lists: Lists = {
      accounts: accountList,
      accountsState: accounts.isError ? 'error' : accounts.data ? 'ready' : 'loading',
      icps: icps.data ?? [],
      icpsFailed: icps.isError,
   }
   const answers = answersOf(form, suggested)
   const parsed = outreachAnswersSchema.safeParse(answers)
   const problems = parsed.success ? [] : [...new Set(parsed.error.issues.map(({ message }) => message))]
   const capacity = capacityOf(used, parsed.success ? parsed.data.postsPerDay : (form.postsPerDay ?? suggested))

   useEffect(() => saveDraft({ form, done: draft.done }), [form, draft.done])

   const set = (patch: Partial<Form>) => setDraft(c => ({ ...c, form: { ...c.form, ...patch } }))
   const finish = (id: StepId) => {
      setNotice(null)
      setDraft(c => ({ ...c, done: c.done.includes(id) ? c.done : [...c.done, id] }))
   }
   const skip = (id: StepId) => {
      setNotice(null)
      setDraft(c => ({ form: resetStep(c.form, id, timeZone), done: c.done.includes(id) ? c.done : [...c.done, id] }))
   }
   const startOver = () => {
      clearDraft()
      setNotice(null)
      setDraft(freshDraft(timeZone))
   }

   if (mode === 'chat' && current === null && parsed.success) {
      const { workflows } = buildOutreach(answers, 'review')

      return (
         <div className="grid w-full gap-4 px-4 lg:px-6">
            <h2 className="text-lg font-semibold">{`Review: ${parsed.data.name}`}</h2>
            <ol className="flex flex-wrap items-center gap-2 text-sm">
               {workflows.map(({ stage, graph }, at) => (
                  <li key={stage} className="flex items-center gap-2">
                     {at > 0 ? <span className="text-muted-foreground">{'\u2192'}</span> : null}
                     <span className="rounded-lg border px-3 py-2">
                        {`${at + 1} ${STAGE_LABELS[stage]}`}
                        <span className="text-muted-foreground block text-xs">{`${graph.nodes.length} blocks`}</span>
                     </span>
                  </li>
               ))}
            </ol>
            <p className="text-sm">{capacity.sentence}</p>
            {parsed.data.postsPerDay > capacity.suggestedPosts && used > 0 ? (
               <p className="text-muted-foreground text-sm">{`${capacity.suggestedPosts} posts a day is enough for these accounts.`}</p>
            ) : null}
            <p className="text-sm">
               {accountList.some(({ status }) => status !== 'ACTIVE')
                  ? `${accountList.filter(({ status }) => status !== 'ACTIVE').length} accounts are not signed in and will be skipped.`
                  : 'Every account is signed in.'}
            </p>
            <p className="text-sm font-medium">
               Nothing will act on LinkedIn yet: every stage is off and "Act for real" is off in every block.
            </p>
            {create.error && !notice ? (
               <Alert variant="destructive">
                  <AlertDescription>{readableError(create.error)}</AlertDescription>
               </Alert>
            ) : null}
            <div className="flex gap-2">
               <Button variant="outline" onClick={() => forget('posts')}>
                  Back
               </Button>
               <Button disabled={create.isPending} onClick={() => create.mutate(parsed.data)}>
                  {create.isPending ? <Loader2 className="animate-spin" /> : null}
                  Create the campaign
               </Button>
            </div>
         </div>
      )
   }

   if (mode === 'chat' && current !== null) {
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
            onEditAll={() => setMode('form')}
            onStartOver={startOver}
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
            onReview={() => {
               setDraft(c => ({ ...c, done: STEPS.map(({ id }) => id) }))
               setMode('chat')
            }}
         />
      </div>
   )
}
