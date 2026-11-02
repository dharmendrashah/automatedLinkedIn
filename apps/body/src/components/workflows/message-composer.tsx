import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { Braces, Variable } from 'lucide-react'
import { useRef, useState } from 'react'

import { trpc } from '../../trpc'
import { MessageCheck } from './message-check'
import { MessageTemplates } from './message-templates'

type Props = {
   id: string
   use: 'invite' | 'message' | 'reply'
   value: string
   onChange: (value: string) => void
}

const PLACEHOLDERS = {
   invite: '{Hi|Hello} {first_name:there}, I would like to connect.',
   message: '{Hi|Hello} {first_name:there}, thanks for connecting.',
   reply: '{Hi|Hello} {first_name:there}, thanks for your message.',
} as const

// The values most texts use, always in view; the rest are under "More values".
const QUICK = ['first_name', 'company', 'title', 'previous_company', 'commented_on', 'connected_ago']
const SAMPLE_CHIPS = 6
// The words of a note, a message or a reply: variables from what we know about the person, options in braces to vary the words, samples to
// start from, and a look at what goes out (.plan/message-composer.md).
export const MessageComposer = ({ id, use, value, onChange }: Props) => {
   const box = useRef<HTMLTextAreaElement>(null)
   const library = trpc.workflow.messageLibrary.useQuery(undefined, { staleTime: Number.POSITIVE_INFINITY })
   const [open, setOpen] = useState(false)
   const quick = QUICK.flatMap(key => library.data?.variables.find(variable => variable.key === key) ?? [])
   const samples = library.data?.samples.filter(sample => sample.use === use) ?? []

   // Puts text where the cursor is, or in place of what is selected, and keeps the cursor after it.
   const insert = (words: string, inside?: [number, number]) => {
      const element = box.current
      const start = element?.selectionStart ?? value.length
      const end = element?.selectionEnd ?? value.length

      onChange(`${value.slice(0, start)}${words}${value.slice(end)}`)
      requestAnimationFrame(() => {
         element?.focus()
         element?.setSelectionRange(start + (inside?.[0] ?? words.length), start + (inside?.[1] ?? words.length))
      })
   }
   const options = () => {
      const element = box.current
      const chosen = element ? value.slice(element.selectionStart, element.selectionEnd) : ''

      // A selected word becomes the first option, ready for the others.
      insert(chosen ? `{${chosen}|}` : '{Hi|Hello}', chosen ? [chosen.length + 2, chosen.length + 2] : [1, 3])
   }
   const groups = ['Person', 'Work', 'Activity', 'Time', 'You'] as const

   return (
      <div className="grid gap-2">
         <Textarea
            id={id}
            ref={box}
            rows={use === 'invite' ? 3 : 5}
            value={value}
            placeholder={PLACEHOLDERS[use]}
            onChange={event => onChange(event.target.value)}
         />
         {value.trim() === '' ? (
            <div className="grid gap-1.5">
               <p className="text-sm font-medium">Start from a sample</p>
               <div className="flex flex-wrap gap-1.5">
                  {samples.slice(0, SAMPLE_CHIPS).map(sample => (
                     <button
                        key={sample.id}
                        type="button"
                        title={sample.text}
                        className="hover:bg-muted rounded-full border px-2.5 py-1 text-xs"
                        onClick={() => onChange(sample.text)}
                     >
                        {sample.title}
                     </button>
                  ))}
               </div>
            </div>
         ) : null}
         <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Insert a value">
            <span className="text-muted-foreground text-xs">Insert</span>
            {quick.map(variable => (
               <button
                  key={variable.key}
                  type="button"
                  title={`${variable.source}. For example: ${variable.example}`}
                  className="hover:bg-muted rounded-full border px-2.5 py-1 text-xs"
                  onClick={() => insert(`{${variable.key}}`)}
               >
                  {variable.label}
               </button>
            ))}
         </div>
         <div className="flex flex-wrap items-center gap-2">
            <Popover open={open} onOpenChange={setOpen}>
               <PopoverTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                     <Variable />
                     More values
                  </Button>
               </PopoverTrigger>
               <PopoverContent align="start" className="grid max-h-96 w-96 gap-3 overflow-y-auto">
                  <p className="text-muted-foreground text-xs">
                     Filled in for each person from what we already know. Add a fallback after a colon, like{' '}
                     <code>{'{first_name:there}'}</code>, for when it is missing.
                  </p>
                  {groups.map(group => (
                     <div key={group} className="grid gap-1">
                        <p className="text-sm font-medium">{group}</p>
                        <div className="flex flex-wrap gap-1.5">
                           {library.data?.variables
                              .filter(variable => variable.group === group)
                              .map(variable => (
                                 <button
                                    key={variable.key}
                                    type="button"
                                    title={`${variable.source}. For example: ${variable.example}`}
                                    className="hover:bg-muted rounded-full border px-2.5 py-1 text-xs"
                                    onClick={() => {
                                       insert(`{${variable.key}}`)
                                       setOpen(false)
                                    }}
                                 >
                                    {variable.label}
                                 </button>
                              ))}
                        </div>
                     </div>
                  ))}
               </PopoverContent>
            </Popover>
            <Button type="button" variant="outline" size="sm" onClick={options} title="Write it in braces with a bar between the options">
               <Braces />
               Vary the words
            </Button>
            <MessageTemplates use={use} text={value} onPick={onChange} />
         </div>
         <p className="text-muted-foreground text-xs">
            One of the options in braces, like <code>{'{Hi|Hello|Hey}'}</code>, is picked at random for each person.
         </p>
         <MessageCheck id={id} use={use} text={value} />
      </div>
   )
}
