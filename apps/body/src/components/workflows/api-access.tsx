import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
   AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { readableError } from '@/lib/trpc-error'
import { Check, CircleCheck, CircleDashed, Copy, KeyRound, Loader2, TriangleAlert } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { cn } from '@/lib/utils'

import { type Graph } from './types'

import { trpc } from '../../trpc'
import { createApiUrl } from '../../trpc/config'

const COPIED_MS = 1_500
// Ends a line of a shell command that goes on below.
const BACKSLASH = String.fromCharCode(92)

const CopyButton = ({ text, label }: { text: string; label: string }) => {
   const [copied, setCopied] = useState(false)

   return (
      <Button
         type="button"
         variant="ghost"
         size="icon"
         aria-label={copied ? 'Copied' : label}
         onClick={() =>
            void navigator.clipboard.writeText(text).then(() => {
               setCopied(true)
               setTimeout(() => setCopied(false), COPIED_MS)
            })
         }
      >
         {copied ? <Check className="text-success" /> : <Copy />}
      </Button>
   )
}

// A block of code with a copy button.
const Code = ({ text, label }: { text: string; label: string }) => (
   <div className="bg-muted relative rounded-md">
      <pre className="overflow-x-auto p-3 pr-12 font-mono text-xs leading-relaxed">{text}</pre>
      <div className="absolute top-1 right-1">
         <CopyButton text={text} label={label} />
      </div>
   </div>
)

const Step = ({ done, title, children }: { done: boolean; title: string; children?: ReactNode }) => (
   <li className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
      {done ? (
         <CircleCheck className="text-success mt-0.5 size-5" aria-label="Done" />
      ) : (
         <CircleDashed className="text-muted-foreground mt-0.5 size-5" aria-label="To do" />
      )}
      <span className="font-medium">{title}</span>
      {children ? <div className="col-start-2 grid gap-2">{children}</div> : null}
   </li>
)

const RESPONSES: [string, string][] = [
   ['202', 'Started. The body has runId and status.'],
   ['400', 'The body is not valid; error says why.'],
   ['401', 'The token is missing or wrong.'],
   ['409', 'The workflow is switched off, already running, or cannot start; error says why.'],
   ['429', 'Too many calls this hour.'],
]

// What each input block can take from a call, with an example link.
const INPUTS = [
   {
      type: 'input.profiles',
      field: 'profiles',
      what: 'people',
      example: 'https://www.linkedin.com/in/ada-lovelace',
   },
   {
      type: 'input.posts',
      field: 'posts',
      what: 'posts',
      example: 'https://www.linkedin.com/posts/ada-lovelace_engines-activity-7452924970042826753-AbCd',
   },
   {
      type: 'input.companies',
      field: 'companies',
      what: 'companies',
      example: 'https://www.linkedin.com/company/stripe',
   },
] as const

type Props = { workflowId: string; enabled: boolean; graph: Graph }

// How another system starts this workflow: what must be ready, the token, a copyable request, and the rules.
export const ApiAccess = ({ workflowId, enabled, graph }: Props) => {
   const [token, setToken] = useState<string | null>(null)
   const status = trpc.workflow.apiStatus.useQuery({ id: workflowId })
   const rotate = trpc.workflow.rotateToken.useMutation({
      onSuccess: data => {
         setToken(data.token)
         void status.refetch()
      },
   })
   const address = `${createApiUrl(import.meta.env)}/api/workflows/${workflowId}/run`
   const hasToken = Boolean(token) || status.data?.hasToken === true
   const ready = enabled && hasToken
   const limits = status.data?.limits
   const inputs = INPUTS.filter(({ type }) => graph.nodes.some(node => node.type === type))
   const body =
      inputs.length > 0
         ? JSON.stringify(Object.fromEntries(inputs.map(({ field, example }) => [field, [example]])), null, 2)
         : null
   const lines = [
      `curl -X POST '${address}'`,
      `  -H 'Authorization: Bearer ${token ?? '<token>'}'`,
      ...(body ? [`  -H 'Content-Type: application/json'`, `  -d '${body.replace(/\n\s*/g, ' ')}'`] : []),
   ]
   const curl = lines.join(` ${BACKSLASH}\n`)
   const createButton = (onClick?: () => void) => (
      <Button type="button" variant={hasToken ? 'outline' : 'default'} disabled={rotate.isPending} onClick={onClick}>
         {rotate.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />}
         {hasToken ? 'New token' : 'Create token'}
      </Button>
   )

   return (
      <div className="grid w-full gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
         <Card>
            <CardHeader>
               <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>Start this workflow from another system</CardTitle>
                  <Badge
                     variant="outline"
                     className={cn(
                        'border-transparent',
                        ready ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
                     )}
                  >
                     {ready ? 'Ready' : 'Not ready'}
                  </Badge>
               </div>
               <CardDescription>Your CRM, a form or a script sends links; each call starts one run.</CardDescription>
            </CardHeader>
            <CardContent>
               <ol className="grid gap-5 text-sm">
                  <Step done={enabled} title="Switch the workflow on">
                     {enabled ? null : (
                        <p className="text-muted-foreground">
                           Use the switch at the top of this page. Calls to a workflow that is off get 409.
                        </p>
                     )}
                  </Step>
                  <Step done={hasToken} title="Create a token">
                     {token ? (
                        <div className="grid gap-2 rounded-md border border-warning/40 bg-warning/5 p-3">
                           <p className="text-warning flex items-center gap-2 text-xs font-medium">
                              <TriangleAlert className="size-4" aria-hidden />
                              Copy it now. It is not shown again.
                           </p>
                           <div className="flex items-center gap-2">
                              <code className="bg-background flex-1 rounded border px-2 py-1.5 font-mono text-xs break-all">
                                 {token}
                              </code>
                              <CopyButton text={token} label="Copy token" />
                           </div>
                        </div>
                     ) : null}
                     <div className="flex flex-wrap items-center gap-3">
                        {hasToken ? (
                           <AlertDialog>
                              <AlertDialogTrigger asChild>{createButton()}</AlertDialogTrigger>
                              <AlertDialogContent>
                                 <AlertDialogHeader>
                                    <AlertDialogTitle>Make a new token?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                       The current token stops working at once. Update every system that calls this
                                       workflow.
                                    </AlertDialogDescription>
                                 </AlertDialogHeader>
                                 <AlertDialogFooter>
                                    <AlertDialogCancel>Keep the current one</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => rotate.mutate({ id: workflowId })}>
                                       Make a new token
                                    </AlertDialogAction>
                                 </AlertDialogFooter>
                              </AlertDialogContent>
                           </AlertDialog>
                        ) : (
                           createButton(() => rotate.mutate({ id: workflowId }))
                        )}
                        <span className="text-muted-foreground text-xs">
                           {hasToken
                              ? 'A token is set. Only a hash is stored, so it cannot be shown again.'
                              : 'No token yet.'}
                        </span>
                     </div>
                     {rotate.error ? <p className="text-destructive">{readableError(rotate.error)}</p> : null}
                  </Step>
                  <Step done={false} title="Send a request">
                     <div className="flex items-center gap-2 rounded-md border p-1 pl-2">
                        <Badge>POST</Badge>
                        <code className="flex-1 truncate font-mono text-xs" title={address}>
                           {address}
                        </code>
                        <CopyButton text={address} label="Copy address" />
                     </div>
                     <Tabs defaultValue="curl">
                        <TabsList>
                           <TabsTrigger value="curl">cURL</TabsTrigger>
                           {body ? <TabsTrigger value="body">JSON body</TabsTrigger> : null}
                        </TabsList>
                        <TabsContent value="curl">
                           <Code text={curl} label="Copy request" />
                        </TabsContent>
                        {body ? (
                           <TabsContent value="body">
                              <Code text={body} label="Copy body" />
                           </TabsContent>
                        ) : null}
                     </Tabs>
                  </Step>
               </ol>
            </CardContent>
         </Card>

         <div className="grid content-start gap-4">
            <Card>
               <CardHeader>
                  <CardTitle className="text-base">What to send</CardTitle>
               </CardHeader>
               <CardContent className="grid gap-2 text-sm">
                  {inputs.length === 0 ? (
                     <p>Nothing. This workflow finds what it needs itself, so a call with no body starts it.</p>
                  ) : (
                     <>
                        <p>Links for its inputs, all optional:</p>
                        <ul className="grid gap-1 text-xs">
                           {inputs.map(({ field, what }) => (
                              <li key={field}>
                                 <code>{field}</code>: LinkedIn links of {what}. Left out, it uses your {what} list.
                              </li>
                           ))}
                        </ul>
                     </>
                  )}
                  <ul className="text-muted-foreground grid list-disc gap-1 pl-5 text-xs">
                     {inputs.length > 0 ? <li>Up to {limits?.items ?? 200} links per call in total.</li> : null}
                     <li>
                        {status.data?.callsLastHour ?? 0} of {limits?.callsPerHour ?? 60} calls used this hour.
                     </li>
                  </ul>
               </CardContent>
            </Card>
            <Card>
               <CardHeader>
                  <CardTitle className="text-base">Answers</CardTitle>
               </CardHeader>
               <CardContent>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
                     {RESPONSES.map(([code, meaning]) => (
                        <div key={code} className="contents">
                           <dt>
                              <Badge variant={code === '202' ? 'secondary' : 'outline'} className="font-mono">
                                 {code}
                              </Badge>
                           </dt>
                           <dd className="text-muted-foreground self-center">{meaning}</dd>
                        </div>
                     ))}
                  </dl>
               </CardContent>
            </Card>
         </div>
      </div>
   )
}
