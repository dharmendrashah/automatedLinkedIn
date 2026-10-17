import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatUsd } from '@/components/workflows/types'
import { readableError } from '@/lib/trpc-error'
import { FlaskConical, Loader2, Play, Workflow } from 'lucide-react'
import { type FormEvent, useDeferredValue, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { cn } from '@/lib/utils'

import { trpc } from '../trpc'

type Extra = 'keywords' | 'customer' | 'titles' | null

type GoalCard = {
   id: 'engagers' | 'problem' | 'accounts' | 'lookalikes' | 'watch'
   title: string
   description: string
   source: { label: string; max: number; fallback: number }
   each: { label: string; fallback: number }
   extra: Extra
   // What a run does, in one sentence.
   explain: (numbers: { source: number; each: number }) => string
}

const GOALS: GoalCard[] = [
   {
      id: 'engagers',
      title: 'Find people engaging with posts I choose',
      description: 'Reads who commented on and reacted to the posts in your posts list.',
      source: {
         label: 'Posts per run',
         max: 50,
         fallback: 5,
      },
      each: {
         label: 'People per post',
         fallback: 50,
      },
      extra: null,
      explain: ({ source, each }) =>
         `takes up to ${source} posts from your posts list and reads up to ${each} comments and ${each} reactions per post`,
   },
   {
      id: 'problem',
      title: 'Find people talking about my problem',
      description: 'Finds recent posts by keywords, then the people who engaged with them.',
      source: {
         label: 'Posts to find',
         max: 100,
         fallback: 10,
      },
      each: {
         label: 'People per post',
         fallback: 50,
      },
      extra: 'keywords',
      explain: ({ source, each }) =>
         `finds up to ${source} recent posts with your keywords and reads up to ${each} comments and ${each} reactions per post`,
   },
   {
      id: 'accounts',
      title: 'Who works at my target accounts',
      description: 'People at the companies in your companies list, by job title.',
      source: {
         label: 'Companies per run',
         max: 100,
         fallback: 10,
      },
      each: {
         label: 'People per company',
         fallback: 25,
      },
      extra: 'titles',
      explain: ({ source, each }) =>
         `takes up to ${source} companies from your companies list and finds up to ${each} people at each`,
   },
   {
      id: 'lookalikes',
      title: 'People like my best customer',
      description: 'Reads what your best customer engages with, then who else engaged there.',
      source: {
         label: 'Their comments and reactions to read',
         max: 50,
         fallback: 10,
      },
      each: {
         label: 'People per post',
         fallback: 50,
      },
      extra: 'customer',
      explain: ({ source, each }) =>
         `reads up to ${source} posts your customer commented on and ${source} they reacted to, then up to ${each} comments and ${each} reactions on each`,
   },
   {
      id: 'watch',
      title: 'Watch people I care about',
      description: 'Once a week, reads the new posts of people in your profiles list and who engaged.',
      source: {
         label: 'People to watch',
         max: 100,
         fallback: 25,
      },
      each: {
         label: 'People per post',
         fallback: 50,
      },
      extra: null,
      explain: ({ source, each }) =>
         `(once a week) reads the last 3 posts of up to ${source} people in your profiles list and up to ${each} comments and ${each} reactions per post`,
   },
]

type Next = 'preview' | 'run' | 'canvas'

const splitWords = (text: string) =>
   text
      .split(',')
      .map(word => word.trim())
      .filter(Boolean)

// The guided start: who you want, what you want to achieve, then a plain review with the cost.
export const WorkflowNew = () => {
   const navigate = useNavigate()
   const [icpId, setIcpId] = useState('')
   const [goal, setGoal] = useState<GoalCard>(GOALS[0])
   const [name, setName] = useState('')
   const [source, setSource] = useState(GOALS[0].source.fallback)
   const [each, setEach] = useState(GOALS[0].each.fallback)
   const [keywords, setKeywords] = useState('')
   const [customer, setCustomer] = useState('')
   const [titles, setTitles] = useState('')
   const [next, setNext] = useState<Next | null>(null)
   // Set once the workflow exists, so a refused first run does not create it twice.
   const [createdId, setCreatedId] = useState<string | null>(null)

   const icps = trpc.icp.list.useQuery()
   const icp = icps.data?.find(({ id }) => id === icpId)
   const options = {
      goal: goal.id,
      icpId,
      posts: source,
      perPost: each,
      keywords: goal.extra === 'keywords' && keywords.trim() ? keywords.trim() : undefined,
      customer: goal.extra === 'customer' && customer.trim() ? customer.trim() : undefined,
      titles: goal.extra === 'titles' ? splitWords(titles) : undefined,
   }
   const extraReady =
      (goal.extra !== 'keywords' || Boolean(options.keywords)) && (goal.extra !== 'customer' || Boolean(options.customer))
   const numbersReady = source >= 1 && source <= goal.source.max && each >= 1 && each <= 500
   const template = useDeferredValue(options)
   const estimate = trpc.workflow.estimate.useQuery(
      { template },
      {
         enabled: Boolean(icpId) && numbersReady,
         placeholderData: previous => previous,
      }
   )
   const start = trpc.workflow.start.useMutation()
   const create = trpc.workflow.create.useMutation()
   const error = create.error ?? start.error

   const pick = (card: GoalCard) => {
      setGoal(card)
      setSource(card.source.fallback)
      setEach(card.each.fallback)
   }

   const go = async (choice: Next) => {
      setNext(choice)

      try {
         const id =
            createdId ??
            (
               await create.mutateAsync({
                  ...options,
                  name: name.trim(),
                  description: goal.title,
               })
            ).id

         setCreatedId(id)

         if (choice !== 'canvas') {
            await start.mutateAsync({
               id,
               preview: choice === 'preview',
            })
         }

         void navigate(`/workflows/${id}`)
      } catch {
         setNext(null)
      }
   }

   const ready = Boolean(icp && name.trim() && numbersReady && extraReady)
   const submit = (event: FormEvent) => event.preventDefault()
   const waiting = estimate.data
      ? {
           engagers: `, with ${estimate.data.posts} posts waiting now`,
           problem: '',
           accounts: `, with ${estimate.data.companies} companies in your list now`,
           lookalikes: '',
           watch: `, with ${estimate.data.profiles} people in your profiles list now`,
        }[goal.id]
      : ''

   return (
      <form onSubmit={submit} className="grid w-full gap-6 px-4 lg:px-6">
         <div className="grid gap-1">
            <h2 className="text-lg font-semibold">New workflow</h2>
            <p className="text-muted-foreground text-sm">Three short steps. You see the cost before anything runs.</p>
         </div>

         <section className="grid gap-3">
            <h3 className="font-medium">1. Your ideal customer</h3>
            {icps.data?.length === 0 ? (
               <p className="text-sm">
                  You have no ideal customer yet.{' '}
                  <Link to="/icps" className="underline underline-offset-4">
                     Describe one first
                  </Link>
                  , then come back.
               </p>
            ) : (
               <Select value={icpId} onValueChange={setIcpId}>
                  <SelectTrigger className="w-80" aria-label="Ideal customer">
                     <SelectValue placeholder="Pick an ideal customer" />
                  </SelectTrigger>
                  <SelectContent>
                     {icps.data?.map(item => (
                        <SelectItem key={item.id} value={item.id}>
                           {item.name}
                        </SelectItem>
                     ))}
                  </SelectContent>
               </Select>
            )}
         </section>

         <section className="grid gap-3">
            <h3 className="font-medium">2. What do you want to achieve?</h3>
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
               {GOALS.map(item => (
                  <button key={item.id} type="button" onClick={() => pick(item)} className="text-left">
                     <Card className={cn('h-full', goal.id === item.id && 'ring-primary ring-2')}>
                        <CardHeader>
                           <CardTitle className="text-base">{item.title}</CardTitle>
                           <CardDescription>{item.description}</CardDescription>
                        </CardHeader>
                     </Card>
                  </button>
               ))}
            </div>
            {goal.extra === 'keywords' ? (
               <div className="grid max-w-xl gap-2">
                  <Label htmlFor="workflow-keywords">Keywords people use when they talk about your problem</Label>
                  <Input
                     id="workflow-keywords"
                     maxLength={200}
                     placeholder="cold email deliverability"
                     value={keywords}
                     onChange={event => setKeywords(event.target.value)}
                  />
               </div>
            ) : null}
            {goal.extra === 'customer' ? (
               <div className="grid max-w-xl gap-2">
                  <Label htmlFor="workflow-customer">LinkedIn profile link of your best customer</Label>
                  <Input
                     id="workflow-customer"
                     maxLength={500}
                     placeholder="linkedin.com/in/ada-lovelace"
                     value={customer}
                     onChange={event => setCustomer(event.target.value)}
                  />
               </div>
            ) : null}
            {goal.extra === 'titles' ? (
               <div className="grid max-w-xl gap-2">
                  <Label htmlFor="workflow-titles">Job titles, separated by commas (leave empty for everyone)</Label>
                  <Input
                     id="workflow-titles"
                     maxLength={500}
                     placeholder="Head of Sales, VP Marketing"
                     value={titles}
                     onChange={event => setTitles(event.target.value)}
                  />
               </div>
            ) : null}
         </section>

         <section className="grid gap-3">
            <h3 className="font-medium">3. Name and review</h3>
            <div className="grid gap-4 sm:grid-cols-3">
               <div className="grid gap-2">
                  <Label htmlFor="workflow-name">Name (also the name of its list)</Label>
                  <Input id="workflow-name" maxLength={100} value={name} onChange={event => setName(event.target.value)} />
               </div>
               <div className="grid gap-2">
                  <Label htmlFor="workflow-source">{goal.source.label}</Label>
                  <Input
                     id="workflow-source"
                     type="number"
                     min={1}
                     max={goal.source.max}
                     value={source}
                     onChange={event => setSource(Number(event.target.value))}
                  />
               </div>
               <div className="grid gap-2">
                  <Label htmlFor="workflow-each">{goal.each.label}</Label>
                  <Input
                     id="workflow-each"
                     type="number"
                     min={1}
                     max={500}
                     value={each}
                     onChange={event => setEach(Number(event.target.value))}
                  />
               </div>
            </div>
            <Card>
               <CardContent className="grid gap-2 pt-6 text-sm">
                  <p>
                     Each run {goal.explain({
                        source,
                        each,
                     })}
                     , keeps the people who fit{icp ? ` "${icp.name}"` : ' your ideal customer'}, and adds them to the list
                     &quot;{name.trim() || 'this workflow'}&quot;.
                  </p>
                  <p>
                     Data cost up to <span className="font-medium">{formatUsd(estimate.data?.totalMicros ?? 0)}</span> a
                     run{waiting}. You pay only for what is found.
                  </p>
               </CardContent>
            </Card>
            {error ? (
               <Alert variant="destructive">
                  <AlertDescription>{readableError(error)}</AlertDescription>
               </Alert>
            ) : null}
            <div className="flex flex-wrap gap-2">
               <Button type="button" variant="outline" disabled={!ready || next !== null} onClick={() => void go('preview')}>
                  {next === 'preview' ? <Loader2 className="animate-spin" /> : <FlaskConical />}
                  Run a preview
               </Button>
               <Button type="button" disabled={!ready || next !== null} onClick={() => void go('run')}>
                  {next === 'run' ? <Loader2 className="animate-spin" /> : <Play />}
                  Run it
               </Button>
               <Button type="button" variant="ghost" disabled={!ready || next !== null} onClick={() => void go('canvas')}>
                  {next === 'canvas' ? <Loader2 className="animate-spin" /> : <Workflow />}
                  Advanced: save and open the canvas
               </Button>
            </div>
         </section>
      </form>
   )
}
