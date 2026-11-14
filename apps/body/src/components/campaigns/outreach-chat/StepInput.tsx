import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ChipsInput } from '@/components/workflows/setting-inputs'
import { ArrowUp } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { CAMPAIGN_LIMITS, capacityOf } from '@automatedLinkedIn/contracts'

import { type Form, STEPS, type StepId, parsePosts, stepProblems } from './steps'

export type Account = {
   id: string
   email: string
   status: string
}

export type Lists = {
   accounts: Account[]
   accountsState: 'loading' | 'error' | 'ready'
   icps: Array<{ id: string; name: string }>
   icpsFailed: boolean
}

type Props = {
   id: StepId
   form: Form
   set: (patch: Partial<Form>) => void
   lists: Lists
   suggested: number
   used: number
   // Records the step as answered.
   onDone: () => void
   // Puts the step's fields back to their start and records it as done.
   onSkip: () => void
}

const PROBLEM = 'Write a whole number from 1 to 50.'
const AREA = 'max-h-40 min-h-10 resize-none'

const Chip = ({ selected, ...props }: React.ComponentProps<typeof Button> & { selected?: boolean }) => (
   <Button
      variant={selected ? 'secondary' : 'outline'}
      size="sm"
      className="rounded-full"
      aria-pressed={selected}
      {...props}
   />
)

// The composer under the thread: option chips for choices, a field and a send button for typed answers.
export const StepInput = ({ id, form, set, lists, suggested, used, onDone, onSkip }: Props) => {
   const root = useRef<HTMLDivElement>(null)
   const [shown, setShown] = useState(false)
   const [describing, setDescribing] = useState(form.icpId === '')
   const [draft, setDraft] = useState(String(form.postsPerDay ?? suggested))
   const step = STEPS.find(each => each.id === id)
   const posts = parsePosts(draft)
   const problems =
      id === 'posts'
         ? posts === null
            ? [PROBLEM]
            : stepProblems('posts', { ...form, postsPerDay: posts }, suggested)
         : stepProblems(id, form, suggested)

   // A new question gets the keyboard.
   useEffect(() => {
      root.current?.querySelector<HTMLElement>('input, textarea, button')?.focus()
   }, [id])

   const submit = () => {
      if (problems.length > 0) {
         setShown(true)

         return
      }

      if (id === 'posts') {
         set({ postsPerDay: posts })
      }

      onDone()
   }
   // Enter sends; in a text area, Shift+Enter makes a new line.
   const enter = (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey) {
         event.preventDefault()
         submit()
      }
   }
   const signedIn = lists.accounts.filter(account => account.status === 'ACTIVE')

   // What can be chosen with one tap, and what can be typed.
   const parts = (): { options?: React.ReactNode; fields?: React.ReactNode } => {
      switch (id) {
         case 'name':
            return {
               fields: (
                  <Input
                     aria-label="Campaign name"
                     maxLength={CAMPAIGN_LIMITS.nameMax}
                     placeholder="Outbound for agencies"
                     value={form.name}
                     onChange={event => set({ name: event.target.value })}
                     onKeyDown={enter}
                  />
               ),
            }
         case 'phrases':
            return { fields: <ChipsInput id="phrases" value={form.phrases} onChange={phrases => set({ phrases })} /> }
         case 'customer':
            return {
               options:
                  lists.icps.length > 0 ? (
                     <>
                        {lists.icps.map(icp => (
                           <Chip
                              key={icp.id}
                              onClick={() => {
                                 set({ icpId: icp.id, titles: [], locations: [] })
                                 onDone()
                              }}
                           >
                              {icp.name}
                           </Chip>
                        ))}
                        <Chip
                           selected={describing}
                           onClick={() => {
                              setDescribing(true)
                              set({ icpId: '' })
                           }}
                        >
                           Describe a new one
                        </Chip>
                     </>
                  ) : null,
               fields: describing ? (
                  <>
                     <ChipsInput id="titles" kind="titles" value={form.titles} onChange={titles => set({ titles })} />
                     <ChipsInput
                        id="locations"
                        kind="locations"
                        value={form.locations}
                        onChange={locations => set({ locations })}
                     />
                  </>
               ) : null,
            }
         case 'accounts':
            return {
               options: (
                  <>
                     <Chip
                        selected={form.accountMode === 'all'}
                        onClick={() => {
                           set({ accountMode: 'all', accountIds: [] })
                           onDone()
                        }}
                     >
                        Every signed-in account
                     </Chip>
                     {lists.accountsState === 'ready' && lists.accounts.length > 0 ? (
                        <Chip selected={form.accountMode === 'pick'} onClick={() => set({ accountMode: 'pick' })}>
                           Pick accounts
                        </Chip>
                     ) : null}
                  </>
               ),
               fields:
                  form.accountMode === 'pick'
                     ? lists.accounts.map(account => (
                          <label key={account.id} className="flex items-center gap-2 text-sm">
                             <Checkbox
                                checked={form.accountIds.includes(account.id)}
                                onCheckedChange={on =>
                                   set({
                                      accountIds:
                                         on === true
                                            ? [...form.accountIds, account.id]
                                            : form.accountIds.filter(each => each !== account.id),
                                   })
                                }
                             />
                             {account.status === 'ACTIVE' ? account.email : `${account.email} (not signed in)`}
                          </label>
                       ))
                     : null,
            }
         case 'note':
            return {
               fields: (
                  <Textarea
                     aria-label="Connection note"
                     className={AREA}
                     maxLength={200}
                     placeholder="Hi {first_name}, ..."
                     value={form.note}
                     onChange={event => set({ note: event.target.value })}
                     onKeyDown={enter}
                  />
               ),
            }
         case 'message':
            return {
               fields: (
                  <Textarea
                     aria-label="First message"
                     className={AREA}
                     placeholder="Write the first message"
                     value={form.message}
                     onChange={event => set({ message: event.target.value })}
                     onKeyDown={enter}
                  />
               ),
            }
         case 'warmUp':
            return {
               fields: (
                  <>
                     <div className="flex flex-wrap gap-4">
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
                     </div>
                     {form.comments === 'texts' ? (
                        <Textarea
                           aria-label="Comment texts, one on each line"
                           className={AREA}
                           placeholder="One text on each line. {author_first_name} works."
                           value={form.texts}
                           onChange={event => set({ texts: event.target.value })}
                        />
                     ) : null}
                  </>
               ),
            }
         case 'when':
            return {
               fields: (
                  <div className="flex flex-wrap items-center gap-2">
                     <Input
                        type="time"
                        aria-label="Time of day"
                        className="w-32"
                        value={form.time}
                        onChange={event => set({ time: event.target.value })}
                        onKeyDown={enter}
                     />
                     <Input
                        aria-label="Time zone"
                        className="w-56"
                        value={form.timeZone}
                        onChange={event => set({ timeZone: event.target.value })}
                        onKeyDown={enter}
                     />
                  </div>
               ),
            }
         case 'handOff':
            return {
               fields: (
                  <Input
                     aria-label="Hand-off address"
                     placeholder="https://"
                     value={form.handOffUrl}
                     onChange={event => set({ handOffUrl: event.target.value })}
                     onKeyDown={enter}
                  />
               ),
            }
         case 'posts':
            return {
               options: (
                  <Chip onClick={onSkip}>{`Use ${suggested} for ${used} ${used === 1 ? 'account' : 'accounts'}`}</Chip>
               ),
               fields: (
                  <Input
                     type="number"
                     aria-label="Posts a day"
                     className="w-28"
                     min={1}
                     max={50}
                     value={draft}
                     onChange={event => setDraft(event.target.value)}
                     onKeyDown={enter}
                  />
               ),
            }
      }
   }
   const { options, fields } = parts()
   const skippable = !step?.required && id !== 'posts'

   return (
      <div ref={root} className="grid gap-2">
         {id === 'accounts' && lists.accountsState !== 'ready' ? (
            <p className="text-muted-foreground text-sm">
               {lists.accountsState === 'loading'
                  ? 'Loading accounts'
                  : 'Your accounts could not be loaded, so every signed-in account will be used.'}
            </p>
         ) : null}
         {id === 'accounts' && lists.accountsState === 'ready' && signedIn.length === 0 ? (
            <p className="text-muted-foreground text-sm">{capacityOf(0, 1).sentence}</p>
         ) : null}
         {id === 'customer' && lists.icpsFailed ? (
            <p className="text-muted-foreground text-sm">
               Your saved ideal customers could not be loaded. Describe one instead.
            </p>
         ) : null}
         {options || skippable ? (
            <div className="flex flex-wrap gap-2">
               {options}
               {skippable ? <Chip onClick={onSkip}>Use default</Chip> : null}
            </div>
         ) : null}
         {shown && problems.length > 0 ? (
            <ul className="text-destructive grid gap-1 text-sm" role="alert">
               {problems.map(problem => (
                  <li key={problem}>{problem}</li>
               ))}
            </ul>
         ) : null}
         {fields ? (
            <div className="flex items-end gap-2">
               <div className="grid min-w-0 flex-1 gap-2">{fields}</div>
               <Button size="icon" className="rounded-full" aria-label="Send" onClick={submit}>
                  <ArrowUp />
               </Button>
            </div>
         ) : null}
      </div>
   )
}
