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

const GOALS = [
   {
      id: 'engagers',
      title: 'Find people engaging with posts I choose',
      description: 'Reads who commented on and reacted to the posts in your posts list.',
      ready: true,
   },
   {
      id: 'problem',
      title: 'Find people talking about my problem',
      description: 'Finds posts by keywords, then the people who engaged. Coming soon.',
      ready: false,
   },
   {
      id: 'accounts',
      title: 'Who works at my target accounts',
      description: 'People at the companies in your companies list. Coming soon.',
      ready: false,
   },
] as const

type Next = 'preview' | 'run' | 'canvas'

// The guided start: who you want, what you want to achieve, then a plain review with the cost.
export const WorkflowNew = () => {
   const navigate = useNavigate()
   const [icpId, setIcpId] = useState('')
   const [goal, setGoal] = useState<string>('engagers')
   const [name, setName] = useState('')
   const [posts, setPosts] = useState(5)
   const [perPost, setPerPost] = useState(50)
   const [next, setNext] = useState<Next | null>(null)
   // Set once the workflow exists, so a refused first run does not create it twice.
   const [createdId, setCreatedId] = useState<string | null>(null)

   const icps = trpc.icp.list.useQuery()
   const icp = icps.data?.find(({ id }) => id === icpId)
   const template = useDeferredValue({
      icpId,
      posts,
      perPost,
   })
   const estimate = trpc.workflow.estimate.useQuery(
      { template },
      {
         enabled: Boolean(icpId) && posts >= 1 && perPost >= 1,
         placeholderData: previous => previous,
      }
   )
   const start = trpc.workflow.start.useMutation()
   const create = trpc.workflow.create.useMutation()
   const error = create.error ?? start.error

   const go = async (choice: Next) => {
      setNext(choice)

      try {
         const id =
            createdId ??
            (
               await create.mutateAsync({
                  name: name.trim(),
                  goal: GOALS.find(item => item.id === goal)?.title,
                  icpId,
                  posts,
                  perPost,
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

   const ready = Boolean(icp && name.trim() && posts >= 1 && posts <= 50 && perPost >= 1 && perPost <= 500)
   const submit = (event: FormEvent) => event.preventDefault()

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
            <div className="grid gap-3 md:grid-cols-3">
               {GOALS.map(item => (
                  <button
                     key={item.id}
                     type="button"
                     disabled={!item.ready}
                     onClick={() => setGoal(item.id)}
                     className="text-left disabled:opacity-50"
                  >
                     <Card className={cn('h-full', goal === item.id && 'ring-primary ring-2')}>
                        <CardHeader>
                           <CardTitle className="text-base">{item.title}</CardTitle>
                           <CardDescription>{item.description}</CardDescription>
                        </CardHeader>
                     </Card>
                  </button>
               ))}
            </div>
         </section>

         <section className="grid gap-3">
            <h3 className="font-medium">3. Name and review</h3>
            <div className="grid gap-4 sm:grid-cols-3">
               <div className="grid gap-2">
                  <Label htmlFor="workflow-name">Name (also the name of its list)</Label>
                  <Input id="workflow-name" maxLength={100} value={name} onChange={event => setName(event.target.value)} />
               </div>
               <div className="grid gap-2">
                  <Label htmlFor="workflow-posts">Posts per run</Label>
                  <Input
                     id="workflow-posts"
                     type="number"
                     min={1}
                     max={50}
                     value={posts}
                     onChange={event => setPosts(Number(event.target.value))}
                  />
               </div>
               <div className="grid gap-2">
                  <Label htmlFor="workflow-per-post">People per post</Label>
                  <Input
                     id="workflow-per-post"
                     type="number"
                     min={1}
                     max={500}
                     value={perPost}
                     onChange={event => setPerPost(Number(event.target.value))}
                  />
               </div>
            </div>
            <Card>
               <CardContent className="grid gap-2 pt-6 text-sm">
                  <p>
                     Each run takes up to {posts} posts from your posts list, reads up to {perPost} comments and{' '}
                     {perPost} reactions per post, keeps the people who fit
                     {icp ? ` "${icp.name}"` : ' your ideal customer'}, reads the full profile of the qualified ones,
                     and adds them to the list &quot;{name.trim() || 'this workflow'}&quot;.
                  </p>
                  <p>
                     Data cost up to <span className="font-medium">{formatUsd(estimate.data?.totalMicros ?? 0)}</span> a
                     run{estimate.data ? `, with ${estimate.data.posts} posts waiting now` : ''}. You pay only for what
                     is found.
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
