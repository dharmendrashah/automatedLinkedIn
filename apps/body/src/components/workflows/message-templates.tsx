import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { readableError } from '@/lib/trpc-error'
import { LayoutTemplate, Save, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { trpc } from '../../trpc'

type Use = 'invite' | 'message' | 'reply'

type Props = {
   use: Use
   text: string
   // Puts a template in the text box.
   onPick: (text: string) => void
}

// Built-in samples and the owner's own texts to start from, and "save this as mine".
export const MessageTemplates = ({ use, text, onPick }: Props) => {
   const utils = trpc.useUtils()
   const library = trpc.workflow.messageLibrary.useQuery(undefined, { staleTime: Number.POSITIVE_INFINITY })
   const [open, setOpen] = useState(false)
   const [name, setName] = useState('')
   const refresh = () => void utils.workflow.messageLibrary.invalidate()
   const save = trpc.workflow.messageTemplateSave.useMutation({
      onSuccess: () => {
         refresh()
         setName('')
         toast.success('Saved to your templates.')
      },
      onError: error => toast.error(readableError(error)),
   })
   const remove = trpc.workflow.messageTemplateDelete.useMutation({
      onSuccess: refresh,
      onError: error => toast.error(readableError(error)),
   })
   const mine = library.data?.mine.filter(template => template.use === use) ?? []
   const samples = library.data?.samples.filter(sample => sample.use === use) ?? []
   const choose = (picked: string) => {
      onPick(picked)
      setOpen(false)
   }
   const row = (id: string, title: string, words: string, onRemove?: () => void) => (
      <li key={id} className="flex items-start gap-1">
         <button
            type="button"
            className="hover:bg-muted grid flex-1 gap-0.5 rounded-md p-2 text-left"
            onClick={() => choose(words)}
         >
            <span className="text-sm font-medium">{title}</span>
            <span className="text-muted-foreground line-clamp-2 text-xs">{words}</span>
         </button>
         {onRemove ? (
            <Button type="button" variant="ghost" size="icon" aria-label={`Delete the template ${title}`} onClick={onRemove}>
               <Trash2 />
            </Button>
         ) : null}
      </li>
   )

   return (
      <>
         <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
               <Button type="button" variant="outline" size="sm">
                  <LayoutTemplate />
                  Templates
               </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="grid max-h-96 w-[28rem] gap-3 overflow-y-auto">
               {mine.length > 0 ? (
                  <div className="grid gap-1">
                     <p className="text-sm font-medium">My templates</p>
                     <ul className="grid">
                        {mine.map(template =>
                           row(template.id, template.name, template.text, () => remove.mutate({ id: template.id }))
                        )}
                     </ul>
                  </div>
               ) : null}
               <div className="grid gap-1">
                  <p className="text-sm font-medium">Samples</p>
                  <p className="text-muted-foreground text-xs">Short and generic. Pick one, then change the words.</p>
                  <ul className="grid">{samples.map(sample => row(sample.id, sample.title, sample.text))}</ul>
               </div>
            </PopoverContent>
         </Popover>
         <Popover>
            <PopoverTrigger asChild>
               <Button type="button" variant="outline" size="sm" disabled={text.trim() === ''}>
                  <Save />
                  Save as mine
               </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="grid w-72 gap-2">
               <label className="text-sm font-medium" htmlFor={`template-name-${use}`}>
                  Name this template
               </label>
               <Input
                  id={`template-name-${use}`}
                  value={name}
                  maxLength={60}
                  placeholder="For example Warm hello"
                  onChange={event => setName(event.target.value)}
               />
               <Button
                  type="button"
                  size="sm"
                  disabled={name.trim() === '' || save.isPending}
                  onClick={() => save.mutate({ use, name, text })}
               >
                  Save
               </Button>
            </PopoverContent>
         </Popover>
      </>
   )
}
