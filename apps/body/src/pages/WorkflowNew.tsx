import { browserTimeZone } from '@/components/workflows/schedule-text'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatUsd } from '@/components/workflows/types'
import { readableError } from '@/lib/trpc-error'
import {
   ArrowRight,
   Briefcase,
   Building,
   Globe,
   Heart,
   Loader2,
   type LucideIcon,
   Merge,
   MessageSquare,
   Plus,
   Search,
   Sparkles,
   Swords,
   UserRound,
   UserSearch,
   Workflow,
} from 'lucide-react'
import { type FormEvent, type ReactNode, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { cn } from '@/lib/utils'

import { type RouterOutputs, trpc } from '../trpc'

type Template = RouterOutputs['workflow']['templates'][number]
type Start = 'blank' | Template['id']

const ICONS: Record<Template['icon'], LucideIcon> = {
   MessageSquare,
   Search,
   Building,
   Heart,
   UserRound,
   UserSearch,
   Briefcase,
   Globe,
   Swords,
   Sparkles,
   Merge,
}

const Choice = ({ on, onPick, children }: { on: boolean; onPick: () => void; children: ReactNode }) => (
   <button type="button" role="radio" aria-checked={on} onClick={onPick} className="text-left">
      <Card className={cn('h-full transition-shadow hover:shadow-md', on && 'ring-primary ring-2')}>{children}</Card>
   </button>
)

const TemplateCard = ({ template }: { template: Template }) => {
   const Icon = ICONS[template.icon]

   return (
      <CardHeader className="flex flex-row items-start gap-3">
         <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
            <Icon className="size-5" aria-hidden />
         </span>
         <div className="grid gap-2">
            <div className="grid gap-1">
               <CardTitle className="text-base">{template.title}</CardTitle>
               <CardDescription>{template.summary}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-1">
               <Badge variant="secondary" title={`For ${template.assumes}`}>
                  Up to {formatUsd(template.costMicros)} a run
               </Badge>
               <Badge variant="outline">{template.useCaseLabel}</Badge>
            </div>
            <dl className="text-muted-foreground grid gap-0.5 text-xs">
               <div>
                  <dt className="inline font-medium">Needs: </dt>
                  <dd className="inline">{template.needs}</dd>
               </div>
               <div>
                  <dt className="inline font-medium">Gives: </dt>
                  <dd className="inline">{template.gives}</dd>
               </div>
               <div>
                  <dt className="inline font-medium">Cost for: </dt>
                  <dd className="inline">{template.assumes}</dd>
               </div>
            </dl>
         </div>
      </CardHeader>
   )
}

// A new workflow in two steps: its name, then blank or a ready-made template. Everything else is set on the canvas.
export const WorkflowNew = () => {
   const navigate = useNavigate()
   const [params] = useSearchParams()
   const [name, setName] = useState('')
   const [picked, setStart] = useState<Start | null>(null)
   const templates = trpc.workflow.templates.useQuery()
   const create = trpc.workflow.create.useMutation({
      onSuccess: workflow => void navigate(`/workflows/${workflow.id}`),
   })
   const list = templates.data ?? []
   // A link such as "Find people here" can pick the template with ?start=<id>.
   const start: Start = picked ?? list.find(({ id }) => id === params.get('start'))?.id ?? 'blank'
   const chosen = list.find(({ id }) => id === start)
   const groups = [...new Set(list.map(({ useCaseLabel }) => useCaseLabel))]

   const submit = (event: FormEvent) => {
      event.preventDefault()

      if (name.trim()) {
         create.mutate({
            name: name.trim(),
            start,
            description: chosen?.title,
            timeZone: browserTimeZone(),
         })
      }
   }

   return (
      <form onSubmit={submit} className="grid w-full gap-6 px-4 lg:px-6">
         <div className="bg-background/95 supports-backdrop-filter:bg-background/80 sticky top-0 z-10 -mx-4 grid gap-2 border-b px-4 py-3 backdrop-blur lg:-mx-6 lg:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
               <div className="grid gap-1">
                  <h2 className="text-lg font-semibold">New workflow</h2>
                  <p className="text-muted-foreground text-sm">Name it, pick a start, and build it on the canvas.</p>
               </div>
               <Button type="submit" disabled={!name.trim() || create.isPending}>
                  {create.isPending ? <Loader2 className="animate-spin" /> : <Workflow />}
                  Open the canvas
                  <ArrowRight aria-hidden />
               </Button>
            </div>
            {create.error ? (
               <Alert variant="destructive">
                  <AlertDescription>{readableError(create.error)}</AlertDescription>
               </Alert>
            ) : null}
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

         <section className="grid gap-4" role="radiogroup" aria-label="How to start">
            <h3 className="text-sm font-medium">2. Start blank or from a ready-made template</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
               <Choice on={start === 'blank'} onPick={() => setStart('blank')}>
                  <CardHeader className="flex flex-row items-start gap-3">
                     <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
                        <Plus className="size-5" aria-hidden />
                     </span>
                     <div className="grid gap-1">
                        <CardTitle className="text-base">Start blank</CardTitle>
                        <CardDescription>An empty canvas with "Run by hand". Add any blocks you like.</CardDescription>
                     </div>
                  </CardHeader>
               </Choice>
            </div>
            {templates.isLoading ? <Loader2 className="text-muted-foreground animate-spin" aria-label="Loading templates" /> : null}
            {templates.error ? (
               <Alert variant="destructive">
                  <AlertDescription>{readableError(templates.error)}</AlertDescription>
               </Alert>
            ) : null}
            {groups.map(group => (
               <div key={group} className="grid gap-2">
                  <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{group}</h4>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                     {list
                        .filter(({ useCaseLabel }) => useCaseLabel === group)
                        .map(template => (
                           <Choice key={template.id} on={start === template.id} onPick={() => setStart(template.id)}>
                              <TemplateCard template={template} />
                           </Choice>
                        ))}
                  </div>
               </div>
            ))}
            <p className="text-muted-foreground text-xs">
               Costs are the most one run can spend at the starting sizes. Change the sizes on the canvas; its estimate is
               the one to check before a run.
            </p>
         </section>
      </form>
   )
}
