import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Bird, CircleHelp, MoreHorizontal } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router'

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
   // Left out until "Yes": the one-page form is the outreach form.
   onEditAll?: () => void
   onStartOver: () => void
   onEmpty: () => void
   busy: boolean
}

const Bubble = ({
   from,
   action,
   children,
}: {
   from: 'assistant' | 'user'
   action?: React.ReactNode
   children: React.ReactNode
}) => (
   <div className={from === 'user' ? 'flex items-end justify-end gap-2' : 'flex items-end justify-start gap-2'}>
      {from === 'assistant' ? (
         <Avatar className="size-8" aria-hidden>
            <AvatarFallback className="bg-blue-500/10 text-blue-600 dark:text-blue-400">
               <Bird className="size-4" />
            </AvatarFallback>
         </Avatar>
      ) : null}
      {action}
      <div
         className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm break-words whitespace-pre-wrap md:max-w-[70%] ${
            from === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
         }`}
      >
         {children}
      </div>
   </div>
)

// A chat that fills the window: a thin progress bar on top, the thread in the middle, and the composer fixed at the bottom.
// The assistant asks one question at a time and every answer stays in the thread.
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
   onEditAll,
   onStartOver,
   onEmpty,
   busy,
}: Props) => {
   const thread = useRef<HTMLDivElement>(null)
   const progress = progressOf(done)
   const at = STEPS.findIndex(({ id }) => id === current)
   const icpName = lists.icps.find(({ id }) => id === form.icpId)?.name ?? null

   // The thread scrolls to the newest message (not the window), without motion when the user asked for none.
   useEffect(() => {
      const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches

      thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: calm ? 'auto' : 'smooth' })
   }, [current, done.length, notice])

   return (
      // Cancels the layout padding and takes the rest of the window under the header.
      <div className="-my-4 flex h-[calc(100svh-var(--header-height))] min-h-0 flex-col md:-my-6 md:h-[calc(100svh-var(--header-height)-1rem)]">
         <div className="relative flex items-center justify-center border-b px-4 py-2 lg:px-6">
            <Progress
               className="h-1 w-28 bg-muted"
               value={progress.percent}
               aria-label="Setup progress"
               aria-valuetext={`Step ${progress.current} of ${progress.total}`}
               aria-valuemin={0}
               aria-valuemax={100}
               aria-valuenow={progress.percent}
            />
            <div className="absolute right-4 lg:right-6">
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <Button variant="ghost" size="icon-sm" aria-label="More">
                        <MoreHorizontal />
                     </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                     {onEditAll ? <DropdownMenuItem onSelect={onEditAll}>Edit all fields</DropdownMenuItem> : null}
                     <DropdownMenuItem onSelect={onStartOver}>Start over</DropdownMenuItem>
                     <DropdownMenuSeparator />
                     <DropdownMenuItem asChild>
                        <Link to="/workflows/new">Start a single workflow</Link>
                     </DropdownMenuItem>
                  </DropdownMenuContent>
               </DropdownMenu>
            </div>
         </div>
         <div
            ref={thread}
            role="log"
            aria-live="polite"
            aria-label="Campaign setup"
            className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto px-4 py-4 lg:px-6"
         >
            {STEPS.slice(0, at + 1).map(({ id, question, hint }) => (
               <div key={id} className="grid gap-3">
                  <Bubble from="assistant">
                     <span className="flex items-center gap-1.5">
                        {question}
                        <Tooltip>
                           <TooltipTrigger asChild>
                              <button
                                 type="button"
                                 aria-label={`More about: ${question}`}
                                 className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 rounded-full outline-none focus-visible:ring-[3px]"
                              >
                                 <CircleHelp aria-hidden className="size-4" />
                              </button>
                           </TooltipTrigger>
                           <TooltipContent className="max-w-xs">{hint}</TooltipContent>
                        </Tooltip>
                     </span>
                  </Bubble>
                  {id !== current ? (
                     <Bubble
                        from="user"
                        action={
                           <Button
                              variant="ghost"
                              size="xs"
                              className="text-muted-foreground"
                              aria-label={`Edit your answer: ${question}`}
                              onClick={() => onReopen(id)}
                           >
                              Edit
                           </Button>
                        }
                     >
                        {answerText(id, form, { icpName, suggested })}
                     </Bubble>
                  ) : null}
               </div>
            ))}
            {notice ? (
               <Alert variant="destructive">
                  <AlertDescription>{notice}</AlertDescription>
               </Alert>
            ) : null}
         </div>
         <div className="bg-background border-t px-4 py-3 lg:px-6">
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
               onEmpty={onEmpty}
               busy={busy}
            />
         </div>
      </div>
   )
}
