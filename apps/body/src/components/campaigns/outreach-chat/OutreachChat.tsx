import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useEffect, useRef } from 'react'

import { type Lists, StepInput } from './StepInput'
import { answerText } from './answer-text'
import { type Form, STEPS, type StepId, progressOf } from './steps'

type Props = {
   form: Form
   set: (patch: Partial<Form>) => void
   // Steps answered or skipped, with the ones that no longer hold left out.
   done: StepId[]
   current: StepId
   lists: Lists
   suggested: number
   used: number
   // A sentence from the server, for example a name already taken.
   notice: string | null
   onDone: (id: StepId) => void
   onSkip: (id: StepId) => void
   onReopen: (id: StepId) => void
}

const Bubble = ({ from, children }: { from: 'assistant' | 'user'; children: React.ReactNode }) => (
   <div className={from === 'user' ? 'flex justify-end' : 'flex justify-start'}>
      <div
         className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm break-words whitespace-pre-wrap ${
            from === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
         }`}
      >
         {children}
      </div>
   </div>
)

// The chat: the assistant asks one question at a time, the answers stay in the thread, the current input sits under it.
export const OutreachChat = ({
   form,
   set,
   done,
   current,
   lists,
   suggested,
   used,
   notice,
   onDone,
   onSkip,
   onReopen,
}: Props) => {
   const end = useRef<HTMLDivElement>(null)
   const progress = progressOf(done)
   const at = STEPS.findIndex(({ id }) => id === current)
   const icpName = lists.icps.find(({ id }) => id === form.icpId)?.name ?? null

   // The newest message scrolls into view, without motion when the user asked for none.
   useEffect(() => {
      const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches

      end.current?.scrollIntoView({ block: 'end', behavior: calm ? 'auto' : 'smooth' })
   }, [current, done.length, notice])

   return (
      <div className="grid gap-4">
         <div className="grid gap-1">
            <div className="flex items-center justify-between gap-2 text-sm">
               <span className="font-medium">{`Step ${progress.current} of ${progress.total}`}</span>
               <span className="text-muted-foreground">{`${progress.percent}%`}</span>
            </div>
            <Progress
               value={progress.percent}
               aria-label="Setup progress"
               aria-valuemin={0}
               aria-valuemax={100}
               aria-valuenow={progress.percent}
            />
         </div>
         <div className="rounded-xl border">
            <div
               role="log"
               aria-live="polite"
               aria-label="Campaign setup"
               className="grid max-h-[55vh] gap-3 overflow-y-auto p-4"
            >
               <Bubble from="assistant">
                  I will ask ten short questions and build six workflows for you, switched off. Nothing acts on LinkedIn
                  until you switch it on.
               </Bubble>
               {STEPS.slice(0, at + 1).map(({ id, question, hint }) => (
                  <div key={id} className="grid gap-3">
                     <Bubble from="assistant">
                        {question}
                        <span className="text-muted-foreground mt-1 block text-xs">{hint}</span>
                     </Bubble>
                     {id !== current ? (
                        <div className="flex items-end justify-end gap-2">
                           <Button
                              variant="ghost"
                              size="xs"
                              aria-label={`Edit your answer: ${question}`}
                              onClick={() => onReopen(id)}
                           >
                              Edit
                           </Button>
                           <Bubble from="user">{answerText(id, form, { icpName, suggested })}</Bubble>
                        </div>
                     ) : null}
                  </div>
               ))}
               {notice ? (
                  <Alert variant="destructive">
                     <AlertDescription>{notice}</AlertDescription>
                  </Alert>
               ) : null}
               <div ref={end} />
            </div>
            <div className="border-t p-4">
               <StepInput
                  key={current}
                  id={current}
                  form={form}
                  set={set}
                  lists={lists}
                  suggested={suggested}
                  used={used}
                  onDone={() => onDone(current)}
                  onSkip={() => onSkip(current)}
               />
            </div>
         </div>
      </div>
   )
}
