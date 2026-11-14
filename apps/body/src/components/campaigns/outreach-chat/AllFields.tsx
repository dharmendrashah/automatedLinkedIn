import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ChipsInput } from '@/components/workflows/setting-inputs'

import { CAMPAIGN_LIMITS } from '@automatedLinkedIn/contracts'

import type { Lists } from './StepInput'
import type { Form } from './steps'

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
   <section className="grid gap-2">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
   </section>
)

// Every answer on one page, for people who prefer a form to a chat. It edits the same answers as the chat.
export const AllFields = ({
   form,
   set,
   lists,
   suggested,
   used,
   problems,
   onReview,
}: {
   form: Form
   set: (patch: Partial<Form>) => void
   lists: Lists
   suggested: number
   used: number
   problems: string[]
   onReview: () => void
}) => (
   <div className="grid gap-6">
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
         <ChipsInput
            id="locations"
            kind="locations"
            value={form.locations}
            onChange={locations => set({ locations })}
         />
         {lists.icps.length > 0 ? (
            <select
               className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
               aria-label="A saved ideal customer"
               value={form.icpId}
               onChange={event => set({ icpId: event.target.value })}
            >
               <option value="">Describe a new one above</option>
               {lists.icps.map(icp => (
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
               <input
                  type="radio"
                  checked={form.accountMode === 'pick'}
                  onChange={() => set({ accountMode: 'pick' })}
               />
               Pick
            </label>
         </div>
         {form.accountMode === 'pick'
            ? lists.accounts.map(account => (
                 <label key={account.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                       checked={form.accountIds.includes(account.id)}
                       onCheckedChange={on =>
                          set({
                             accountIds:
                                on === true
                                   ? [...form.accountIds, account.id]
                                   : form.accountIds.filter(id => id !== account.id),
                          })
                       }
                    />
                    {account.email}
                 </label>
              ))
            : null}
      </Field>
      <Field
         label="5. Connection note (optional)"
         hint="Up to 200 characters. {first_name} works. Only the best-scored people carry it."
      >
         <Textarea maxLength={200} value={form.note} onChange={event => set({ note: event.target.value })} />
      </Field>
      <Field label="6. First message" hint="Sent to people who accept, after a wait, if you have not talked before.">
         <Textarea value={form.message} onChange={event => set({ message: event.target.value })} />
      </Field>
      <Field
         label="7. Warm-up"
         hint="While an invite is pending, the account reacts to their posts. A comment waits for your approval."
      >
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
            <Input
               type="time"
               aria-label="Time of day"
               className="w-32"
               value={form.time}
               onChange={event => set({ time: event.target.value })}
            />
            <Input
               aria-label="Time zone"
               className="w-56"
               value={form.timeZone}
               onChange={event => set({ timeZone: event.target.value })}
            />
         </div>
      </Field>
      <Field label="9. Hand-off" hint="A daily file of the people to follow up by hand.">
         <Input
            placeholder="https://"
            value={form.handOffUrl}
            onChange={event => set({ handOffUrl: event.target.value })}
         />
      </Field>
      <Field
         label="10. Posts a day"
         hint={`We suggest ${suggested} for ${used} ${used === 1 ? 'account' : 'accounts'}.`}
      >
         <Input
            type="number"
            className="w-28"
            min={1}
            max={50}
            value={form.postsPerDay ?? suggested}
            onChange={event => set({ postsPerDay: event.target.value === '' ? null : Number(event.target.value) })}
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
         <Button disabled={problems.length > 0} onClick={onReview}>
            Review
         </Button>
      </div>
   </div>
)
