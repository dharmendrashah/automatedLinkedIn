import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ChipsInput } from '@/components/workflows/setting-inputs'
import { browserTimeZone } from '@/components/workflows/schedule-text'
import { readableError } from '@/lib/trpc-error'
import {
   CAMPAIGN_LIMITS,
   type OutreachAnswers,
   STAGE_LABELS,
   buildOutreach,
   capacityOf,
   outreachAnswersSchema,
} from '@automatedLinkedIn/contracts'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { trpc } from '../trpc'

type Form = {
   name: string
   phrases: string[]
   titles: string[]
   locations: string[]
   sizes: string[]
   industries: string[]
   icpId: string
   accountMode: 'all' | 'pick'
   accountIds: string[]
   note: string
   message: string
   reactions: boolean
   comments: 'off' | 'texts'
   texts: string
   time: string
   timeZone: string
   handOffUrl: string
   postsPerDay: number | null
}

const answersOf = (form: Form, suggested: number): OutreachAnswers => ({
   name: form.name,
   phrases: form.phrases,
   customer: {
      icpId: form.icpId,
      includeTitles: form.titles,
      locations: form.locations,
      companySizes: form.sizes,
      industries: form.industries,
   },
   accounts: {
      mode: form.accountMode,
      ids: form.accountIds,
   },
   note: form.note,
   message: form.message,
   warmUp: {
      reactions: form.reactions,
      comments: form.comments,
      texts: form.texts
         .split('\n')
         .map(line => line.trim())
         .filter(Boolean),
   },
   when: {
      time: form.time,
      timeZone: form.timeZone,
   },
   handOffUrl: form.handOffUrl,
   postsPerDay: form.postsPerDay ?? suggested,
})

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
   <section className="grid max-w-2xl gap-2">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
   </section>
)

// One form that builds the six workflows of the outreach pipeline, switched off (.plan/lead-pipeline-p6-campaign-starter.md). Plain
// words, safe defaults; nothing here names a block or a threshold. The review shows what will be made before anything is.
export const NewCampaign = () => {
   const navigate = useNavigate()
   const accounts = trpc.linkedInAccount.list.useQuery(undefined, { retry: false })
   const icps = trpc.icp.list.useQuery(undefined, { retry: false })
   const create = trpc.campaign.createOutreach.useMutation({
      onSuccess: made => void navigate(`/campaigns/${made.campaignId}`),
   })
   const [reviewing, setReviewing] = useState(false)
   const [form, setForm] = useState<Form>({
      name: '',
      phrases: [],
      titles: [],
      locations: [],
      sizes: [],
      industries: [],
      icpId: '',
      accountMode: 'all',
      accountIds: [],
      note: '',
      message: '',
      reactions: true,
      comments: 'off',
      texts: '',
      time: '09:00',
      timeZone: browserTimeZone(),
      handOffUrl: '',
      postsPerDay: null,
   })
   const set = (patch: Partial<Form>) => setForm(current => ({ ...current, ...patch }))
   const signedIn = (accounts.data ?? []).filter(account => account.status === 'ACTIVE')
   const used = form.accountMode === 'pick' ? signedIn.filter(({ id }) => form.accountIds.includes(id)) : signedIn
   const suggested = capacityOf(used.length, 1).suggestedPosts
   const answers = answersOf(form, suggested)
   const parsed = outreachAnswersSchema.safeParse(answers)
   const problems = parsed.success ? [] : [...new Set(parsed.error.issues.map(({ message }) => message))]
   const capacity = capacityOf(used.length, parsed.success ? parsed.data.postsPerDay : (form.postsPerDay ?? suggested))

   if (reviewing && parsed.success) {
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
            {parsed.data.postsPerDay > capacity.suggestedPosts && used.length > 0 ? (
               <p className="text-muted-foreground text-sm">{`${capacity.suggestedPosts} posts a day is enough for these accounts.`}</p>
            ) : null}
            <p className="text-sm">
              {signedIn.length < (accounts.data ?? []).length
                  ? `${(accounts.data ?? []).length - signedIn.length} accounts are not signed in and will be skipped.`
                  : 'Every account is signed in.'}
            </p>
            <p className="text-sm font-medium">
               Nothing will act on LinkedIn yet: every stage is off and "Act for real" is off in every block.
            </p>
            {create.error ? (
               <Alert variant="destructive">
                  <AlertDescription>{readableError(create.error)}</AlertDescription>
               </Alert>
            ) : null}
            <div className="flex gap-2">
               <Button variant="outline" onClick={() => setReviewing(false)}>
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

   return (
      <div className="grid w-full gap-6 px-4 lg:px-6">
         <div className="grid gap-1">
            <h2 className="text-lg font-semibold">New outreach campaign</h2>
            <p className="text-muted-foreground text-sm">
               Answer these and six workflows are built for you, switched off. You can open and change every one on the
               canvas. Prefer to build one yourself?{' '}
               <Link className="underline" to="/workflows/new">
                  Start a single workflow
               </Link>
               .
            </p>
         </div>

         <Field label="1. Name" hint="1 to 60 characters. The people it finds get a label made from it.">
            <Input
               maxLength={CAMPAIGN_LIMITS.nameMax}
               value={form.name}
               placeholder="Outbound for agencies"
               onChange={event => set({ name: event.target.value })}
            />
         </Field>
         <Field label="2. What problem do you solve?" hint="Words people use when they post about it. 1 to 5 phrases.">
            <ChipsInput id="phrases" value={form.phrases} onChange={phrases => set({ phrases })} />
         </Field>
         <Field label="3. Who is your ideal customer?" hint="Job titles are enough. Or use one you saved.">
            <ChipsInput id="titles" kind="titles" value={form.titles} onChange={titles => set({ titles })} />
            <ChipsInput id="locations" kind="locations" value={form.locations} onChange={locations => set({ locations })} />
            {(icps.data ?? []).length > 0 ? (
               <select
                  className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
                  aria-label="A saved ideal customer"
                  value={form.icpId}
                  onChange={event => set({ icpId: event.target.value })}
               >
                  <option value="">Describe a new one above</option>
                  {(icps.data ?? []).map(icp => (
                     <option key={icp.id} value={icp.id}>
                        {icp.name}
                     </option>
                  ))}
               </select>
            ) : null}
         </Field>
         <Field label="4. Which accounts?">
            <div className="flex gap-4 text-sm">
               <label className="flex items-center gap-2">
                  <input type="radio" checked={form.accountMode === 'all'} onChange={() => set({ accountMode: 'all' })} />
                  Every signed-in account
               </label>
               <label className="flex items-center gap-2">
                  <input type="radio" checked={form.accountMode === 'pick'} onChange={() => set({ accountMode: 'pick' })} />
                  Pick
               </label>
            </div>
            {form.accountMode === 'pick'
               ? (accounts.data ?? []).map(account => (
                    <label key={account.id} className="flex items-center gap-2 text-sm">
                       <Checkbox
                          checked={form.accountIds.includes(account.id)}
                          onCheckedChange={on =>
                             set({
                                accountIds: on === true ? [...form.accountIds, account.id] : form.accountIds.filter(id => id !== account.id),
                             })
                          }
                       />
                       {account.email}
                    </label>
                 ))
               : null}
         </Field>
         <Field label="5. Connection note (optional)" hint="Up to 200 characters. {first_name} works. Only the best-scored people carry it.">
            <Textarea maxLength={200} value={form.note} onChange={event => set({ note: event.target.value })} />
         </Field>
         <Field label="6. First message" hint="Sent to people who accept, after a wait, if you have not talked before. Written by AI comes with the next step.">
            <Textarea value={form.message} onChange={event => set({ message: event.target.value })} />
         </Field>
         <Field label="7. Warm-up" hint="While an invite is pending, the account reacts to their posts. A comment waits for your approval.">
            <label className="flex items-center gap-2 text-sm">
               <Checkbox checked={form.reactions} onCheckedChange={on => set({ reactions: on === true })} />
               React to their posts
            </label>
            <label className="flex items-center gap-2 text-sm">
               <Checkbox
                  checked={form.comments === 'texts'}
                  onCheckedChange={on => set({ comments: on === true ? 'texts' : 'off' })}
               />
               Comment with my texts
            </label>
            {form.comments === 'texts' ? (
               <Textarea
                  aria-label="Comment texts, one on each line"
                  placeholder="One text on each line. {author_first_name} works."
                  value={form.texts}
                  onChange={event => set({ texts: event.target.value })}
               />
            ) : null}
         </Field>
         <Field label="8. When should it run?">
            <div className="flex flex-wrap items-center gap-2">
               <Input type="time" className="w-32" value={form.time} onChange={event => set({ time: event.target.value })} />
               <Input className="w-56" value={form.timeZone} onChange={event => set({ timeZone: event.target.value })} />
            </div>
         </Field>
         <Field label="9. Hand-off" hint="A daily file of the people to follow up by hand. Also send it to an address (optional).">
            <Input
               placeholder="https://"
               value={form.handOffUrl}
               onChange={event => set({ handOffUrl: event.target.value })}
            />
         </Field>
         <Field label="10. Posts a day" hint={`We suggest ${suggested} for ${used.length} ${used.length === 1 ? 'account' : 'accounts'}.`}>
            <Input
               type="number"
               className="w-28"
               min={1}
               max={50}
               value={form.postsPerDay ?? suggested}
               onChange={event => set({ postsPerDay: Number(event.target.value) })}
            />
         </Field>

         {problems.length > 0 ? (
            <ul className="text-destructive grid gap-1 text-sm">
               {problems.map(problem => (
                  <li key={problem}>{problem}</li>
               ))}
            </ul>
         ) : null}
         <div>
            <Button disabled={problems.length > 0} onClick={() => setReviewing(true)}>
               Review
            </Button>
         </div>
      </div>
   )
}
