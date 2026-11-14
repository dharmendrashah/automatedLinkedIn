import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { LOCATIONS, TITLES } from '@/components/workflows/chip-values'
import { Chips, ChipsInput } from '@/components/workflows/setting-inputs'
import { Loader2 } from 'lucide-react'

import { CAMPAIGN_LIMITS } from '@automatedLinkedIn/contracts'

import { parseWorth } from '../pipeline-format'
import { ChoiceButtons } from './ChoiceButtons'
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
   error,
   busy,
   onCreate,
}: {
   form: Form
   set: (patch: Partial<Form>) => void
   lists: Lists
   suggested: number
   used: number
   problems: string[]
   error: string | null
   busy: boolean
   onCreate: () => void
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
         {lists.icps.length > 0 ? (
            <Chips
               id="saved-customer"
               options={[
                  { value: '', label: 'Describe a new one' },
                  ...lists.icps.map(icp => ({ value: icp.id, label: icp.name })),
               ]}
               isOn={each => each === form.icpId}
               onToggle={icpId => set({ icpId })}
            />
         ) : null}
         <ChoiceButtons
            id="titles"
            kind="titles"
            ownLabel="Add a job title"
            options={TITLES.slice(0, 16)}
            value={form.titles}
            onChange={titles => set({ titles })}
         />
         <ChoiceButtons
            id="locations"
            kind="locations"
            ownLabel="Add a place"
            options={LOCATIONS.slice(0, 14)}
            value={form.locations}
            onChange={locations => set({ locations })}
         />
      </Field>
      <Field label="4. Which accounts?">
         <Chips
            id="account-mode"
            options={[
               { value: 'all', label: 'Every signed-in account' },
               { value: 'pick', label: 'Pick' },
            ]}
            isOn={each => each === form.accountMode}
            onToggle={each => set({ accountMode: each === 'pick' ? 'pick' : 'all' })}
         />
         {form.accountMode === 'pick' ? (
            <Chips
               id="accounts"
               options={lists.accounts.map(account => ({ value: account.id, label: account.email }))}
               isOn={each => form.accountIds.includes(each)}
               onToggle={each =>
                  set({
                     accountIds: form.accountIds.includes(each)
                        ? form.accountIds.filter(id => id !== each)
                        : [...form.accountIds, each],
                  })
               }
            />
         ) : null}
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
         <Chips
            id="warm-up"
            options={[
               { value: 'reactions', label: 'React to their posts' },
               { value: 'comments', label: 'Comment with my texts' },
            ]}
            isOn={each => (each === 'reactions' ? form.reactions : form.comments === 'texts')}
            onToggle={each =>
               each === 'reactions'
                  ? set({ reactions: !form.reactions })
                  : set({ comments: form.comments === 'texts' ? 'off' : 'texts' })
            }
         />
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

      <Field
         label="11. What one positive reply is worth"
         hint="Whole USD a month. The revenue pipeline is positive replies x this x 12. You can set it later on the campaign page."
      >
         <div className="flex items-center gap-2">
            <span className="text-sm">$</span>
            <Input
               inputMode="numeric"
               aria-label="Worth of one positive reply, in USD a month"
               className="w-32"
               placeholder="100"
               value={form.replyValueUsd ?? ''}
               onChange={event => {
                  const worth = parseWorth(event.target.value)

                  set({ replyValueUsd: worth === 'invalid' ? form.replyValueUsd : worth })
               }}
            />
            <span className="text-sm">a month</span>
         </div>
      </Field>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {problems.length > 0 ? (
         <ul className="text-destructive grid gap-1 text-sm">
            {problems.map(problem => (
               <li key={problem}>{problem}</li>
            ))}
         </ul>
      ) : null}
      <div>
         <Button disabled={problems.length > 0 || busy} onClick={onCreate}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Create campaign
         </Button>
      </div>
   </div>
)
