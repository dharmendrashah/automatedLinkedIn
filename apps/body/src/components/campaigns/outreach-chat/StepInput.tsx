import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ChipsInput } from '@/components/workflows/setting-inputs'
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

// The input for the step the assistant just asked, shown under the thread. Options are buttons; typed answers are fields.
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
   const enter = (event: React.KeyboardEvent) => {
      if (event.key === 'Enter') {
         event.preventDefault()
         submit()
      }
   }
   const signedIn = lists.accounts.filter(account => account.status === 'ACTIVE')

   const fields = () => {
      switch (id) {
         case 'name':
            return (
               <Input
                  aria-label="Campaign name"
                  maxLength={CAMPAIGN_LIMITS.nameMax}
                  placeholder="Outbound for agencies"
                  value={form.name}
                  onChange={event => set({ name: event.target.value })}
                  onKeyDown={enter}
               />
            )
         case 'phrases':
            return <ChipsInput id="phrases" value={form.phrases} onChange={phrases => set({ phrases })} />
         case 'customer':
            return (
               <>
                  {lists.icpsFailed ? (
                     <p className="text-muted-foreground text-sm">
                        Your saved ideal customers could not be loaded. Describe one instead.
                     </p>
                  ) : null}
                  {lists.icps.length > 0 ? (
                     <div className="flex flex-wrap gap-2">
                        {lists.icps.map(icp => (
                           <Button
                              key={icp.id}
                              variant="outline"
                              onClick={() => {
                                 set({ icpId: icp.id, titles: [], locations: [] })
                                 onDone()
                              }}
                           >
                              {icp.name}
                           </Button>
                        ))}
                        <Button
                           variant={describing ? 'secondary' : 'outline'}
                           aria-pressed={describing}
                           onClick={() => {
                              setDescribing(true)
                              set({ icpId: '' })
                           }}
                        >
                           Describe a new one
                        </Button>
                     </div>
                  ) : null}
                  {describing ? (
                     <>
                        <ChipsInput
                           id="titles"
                           kind="titles"
                           value={form.titles}
                           onChange={titles => set({ titles })}
                        />
                        <ChipsInput
                           id="locations"
                           kind="locations"
                           value={form.locations}
                           onChange={locations => set({ locations })}
                        />
                     </>
                  ) : null}
               </>
            )
         case 'accounts':
            return (
               <>
                  {lists.accountsState === 'loading' ? <p className="text-sm">Loading accounts</p> : null}
                  {lists.accountsState === 'error' ? (
                     <p className="text-muted-foreground text-sm">
                        Your accounts could not be loaded, so every signed-in account will be used.
                     </p>
                  ) : null}
                  {lists.accountsState === 'ready' && signedIn.length === 0 ? (
                     <p className="text-muted-foreground text-sm">{capacityOf(0, 1).sentence}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                     <Button
                        variant={form.accountMode === 'all' ? 'secondary' : 'outline'}
                        aria-pressed={form.accountMode === 'all'}
                        onClick={() => {
                           set({ accountMode: 'all', accountIds: [] })
                           onDone()
                        }}
                     >
                        Every signed-in account
                     </Button>
                     {lists.accountsState === 'ready' && lists.accounts.length > 0 ? (
                        <Button
                           variant={form.accountMode === 'pick' ? 'secondary' : 'outline'}
                           aria-pressed={form.accountMode === 'pick'}
                           onClick={() => set({ accountMode: 'pick' })}
                        >
                           Pick accounts
                        </Button>
                     ) : null}
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
                                            : form.accountIds.filter(each => each !== account.id),
                                   })
                                }
                             />
                             {account.status === 'ACTIVE' ? account.email : `${account.email} (not signed in)`}
                          </label>
                       ))
                     : null}
               </>
            )
         case 'note':
            return (
               <Textarea
                  aria-label="Connection note"
                  maxLength={200}
                  value={form.note}
                  onChange={event => set({ note: event.target.value })}
               />
            )
         case 'message':
            return (
               <Textarea
                  aria-label="First message"
                  value={form.message}
                  onChange={event => set({ message: event.target.value })}
               />
            )
         case 'warmUp':
            return (
               <>
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
               </>
            )
         case 'when':
            return (
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
            )
         case 'handOff':
            return (
               <Input
                  aria-label="Hand-off address"
                  placeholder="https://"
                  value={form.handOffUrl}
                  onChange={event => set({ handOffUrl: event.target.value })}
                  onKeyDown={enter}
               />
            )
         case 'posts':
            return (
               <>
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
                  <p className="text-muted-foreground text-xs">
                     {`We suggest ${suggested} for ${used} ${used === 1 ? 'account' : 'accounts'}.`}
                  </p>
               </>
            )
      }
   }

   return (
      <div ref={root} className="grid gap-3">
         {fields()}
         {shown && problems.length > 0 ? (
            <ul className="text-destructive grid gap-1 text-sm" role="alert">
               {problems.map(problem => (
                  <li key={problem}>{problem}</li>
               ))}
            </ul>
         ) : null}
         <div className="flex flex-wrap gap-2">
            <Button onClick={submit}>Continue</Button>
            {step?.required ? null : (
               <Button variant="ghost" onClick={onSkip}>
                  Use default
               </Button>
            )}
         </div>
      </div>
   )
}
