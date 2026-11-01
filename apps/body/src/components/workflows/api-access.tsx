import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CircleCheck, CircleDashed } from 'lucide-react'
import { type ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { type Graph } from './types'

import { ApiRequest, TokenControl } from './api-request'
import { apiInputsOf } from './api-sample'
import { useApiToken } from './use-api-token'

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

type Props = { workflowId: string; enabled: boolean; graph: Graph }

// How another system starts this workflow: what must be ready, the token, a copyable request, and the rules.
export const ApiAccess = ({ workflowId, enabled, graph }: Props) => {
   const api = useApiToken(workflowId)
   const { status, hasToken } = api
   const ready = enabled && hasToken
   const limits = status.data?.limits
   const inputs = apiInputsOf(graph)

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
                     <TokenControl workflowId={workflowId} api={api} />
                  </Step>
                  <Step done={false} title="Send a request">
                     <ApiRequest workflowId={workflowId} graph={graph} token={api.token} />
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
