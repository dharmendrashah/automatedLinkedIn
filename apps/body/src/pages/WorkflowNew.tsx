import { browserTimeZone } from '@/components/workflows/schedule-text'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { readableError } from '@/lib/trpc-error'
import {
   Building,
   Heart,
   Loader2,
   type LucideIcon,
   MessageSquare,
   Plus,
   Search,
   UserRound,
   Workflow,
} from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router'

import { cn } from '@/lib/utils'

import { trpc } from '../trpc'

type Start = 'blank' | 'engagers' | 'problem' | 'accounts' | 'lookalikes' | 'watch'

const STARTS: { id: Start; title: string; description: string; icon: LucideIcon }[] = [
   {
      id: 'blank',
      title: 'Start blank',
      description: 'An empty canvas with "Run by hand". Add any blocks you like.',
      icon: Plus,
   },
   {
      id: 'engagers',
      title: 'People engaging with posts I choose',
      description: 'Commenters and reactors of the posts in your posts list.',
      icon: MessageSquare,
   },
   {
      id: 'problem',
      title: 'People talking about my problem',
      description: 'Finds recent posts by keywords, then who engaged with them.',
      icon: Search,
   },
   {
      id: 'accounts',
      title: 'Who works at my target accounts',
      description: 'People at the companies in your companies list.',
      icon: Building,
   },
   {
      id: 'lookalikes',
      title: 'People like my best customer',
      description: 'What your best customer engages with, then who else engaged there.',
      icon: Heart,
   },
   {
      id: 'watch',
      title: 'Watch people I care about',
      description: 'Each week, new posts of people in your profiles list and who engaged.',
      icon: UserRound,
   },
]

// A new workflow in two steps: its name, then blank or a ready-made template. Everything else is set on the canvas.
export const WorkflowNew = () => {
   const navigate = useNavigate()
   const [name, setName] = useState('')
   const [start, setStart] = useState<Start>('blank')
   const create = trpc.workflow.create.useMutation({
      onSuccess: workflow => void navigate(`/workflows/${workflow.id}`),
   })
   const chosen = STARTS.find(({ id }) => id === start)

   const submit = (event: FormEvent) => {
      event.preventDefault()

      if (name.trim()) {
         create.mutate({
            name: name.trim(),
            start,
            description: start === 'blank' ? undefined : chosen?.title,
            timeZone: browserTimeZone(),
         })
      }
   }

   return (
      <form onSubmit={submit} className="grid w-full gap-6 px-4 lg:px-6">
         <div className="grid gap-1">
            <h2 className="text-lg font-semibold">New workflow</h2>
            <p className="text-muted-foreground text-sm">Name it, pick a start, and build it on the canvas.</p>
         </div>

         <section className="grid max-w-xl gap-2">
            <Label htmlFor="workflow-name">1. Name (also the name of its list)</Label>
            <Input
               id="workflow-name"
               autoFocus
               maxLength={100}
               placeholder="Founders talking about outbound"
               value={name}
               onChange={event => setName(event.target.value)}
            />
         </section>

         <section className="grid gap-3">
            <h3 className="text-sm font-medium">2. Start blank or from a ready-made template</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="How to start">
               {STARTS.map(item => {
                  const Icon = item.icon

                  return (
                     <button
                        key={item.id}
                        type="button"
                        role="radio"
                        aria-checked={start === item.id}
                        onClick={() => setStart(item.id)}
                        className="text-left"
                     >
                        <Card className={cn('h-full transition-shadow hover:shadow-md', start === item.id && 'ring-primary ring-2')}>
                           <CardHeader className="flex flex-row items-start gap-3">
                              <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
                                 <Icon className="size-5" aria-hidden />
                              </span>
                              <div className="grid gap-1">
                                 <CardTitle className="text-base">{item.title}</CardTitle>
                                 <CardDescription>{item.description}</CardDescription>
                              </div>
                           </CardHeader>
                        </Card>
                     </button>
                  )
               })}
            </div>
         </section>

         {create.error ? (
            <Alert variant="destructive">
               <AlertDescription>{readableError(create.error)}</AlertDescription>
            </Alert>
         ) : null}
         <div>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
               {create.isPending ? <Loader2 className="animate-spin" /> : <Workflow />}
               Open the canvas
            </Button>
         </div>
      </form>
   )
}
