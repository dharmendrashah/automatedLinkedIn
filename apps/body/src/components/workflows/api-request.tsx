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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { readableError } from '@/lib/trpc-error'
import { Check, CircleCheck, CircleDashed, Copy, KeyRound, Loader2, TriangleAlert } from 'lucide-react'
import { useState } from 'react'

import { type Block, type Graph } from './types'

import { createApiUrl } from '../../trpc/config'
import { apiInputsOf, curlOf, sampleBody } from './api-sample'
import { type ApiToken, useApiToken } from './use-api-token'

// The pieces of "start this workflow from another system", shared by the workflow's API tab and the Input tab of the
// "When called by API" block (.plan/api-trigger-input.md).

const COPIED_MS = 1_500

export const CopyButton = ({ text, label }: { text: string; label: string }) => {
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
export const Code = ({ text, label }: { text: string; label: string }) => (
   <div className="bg-muted relative rounded-md">
      <pre className="overflow-x-auto p-3 pr-12 font-mono text-xs leading-relaxed">{text}</pre>
      <div className="absolute top-1 right-1">
         <CopyButton text={text} label={label} />
      </div>
   </div>
)

// Creates or replaces the token. A new token is shown once; replacing one asks first, because the old one stops working.
export const TokenControl = ({ workflowId, api }: { workflowId: string; api: ApiToken }) => {
   const { token, rotate, hasToken } = api
   const createButton = (onClick?: () => void) => (
      <Button type="button" variant={hasToken ? 'outline' : 'default'} disabled={rotate.isPending} onClick={onClick}>
         {rotate.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />}
         {hasToken ? 'New token' : 'Create token'}
      </Button>
   )

   return (
      <>
         {token ? (
            <div className="border-warning/40 bg-warning/5 grid gap-2 rounded-md border p-3">
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
                           The current token stops working at once. Update every system that calls this workflow.
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
               {hasToken ? 'A token is set. Only a hash is stored, so it cannot be shown again.' : 'No token yet.'}
            </span>
         </div>
         {rotate.error ? <p className="text-destructive text-sm">{readableError(rotate.error)}</p> : null}
      </>
   )
}

// The address, and the call as a cURL and as the JSON body alone, with fields that follow the blocks after the trigger.
export const ApiRequest = ({
   workflowId,
   graph,
   catalog,
   token,
}: {
   workflowId: string
   graph: Graph
   catalog: readonly Block[]
   token: string | null
}) => {
   const address = `${createApiUrl(import.meta.env)}/api/workflows/${workflowId}/run`
   const body = sampleBody(apiInputsOf(graph, catalog))

   return (
      <>
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
               <Code text={curlOf(address, token, body)} label="Copy request" />
            </TabsContent>
            {body ? (
               <TabsContent value="body">
                  <Code text={body} label="Copy body" />
               </TabsContent>
            ) : null}
         </Tabs>
      </>
   )
}

const Readiness = ({ done, children }: { done: boolean; children: string }) => (
   <li className="flex items-center gap-2">
      {done ? (
         <CircleCheck className="text-success size-4" aria-label="Done" />
      ) : (
         <CircleDashed className="text-muted-foreground size-4" aria-label="To do" />
      )}
      {children}
   </li>
)

// The Input tab of the "When called by API" block: what must be ready, the header with the key, and a sample call whose
// body follows the blocks that come after it.
export const ApiTriggerInput = ({
   workflowId,
   enabled,
   graph,
   catalog,
}: {
   workflowId: string
   enabled: boolean
   graph: Graph
   catalog: readonly Block[]
}) => {
   const api = useApiToken(workflowId)
   const inputs = apiInputsOf(graph, catalog)
   const header = `Authorization: Bearer ${api.token ?? 'YOUR_API_KEY'}`

   return (
      <div className="grid gap-4 text-sm">
         <p>Another system starts this workflow by sending a request. Each call starts one run.</p>
         <ul className="grid gap-1">
            <Readiness done={enabled}>The workflow is switched on (the switch at the top of the page)</Readiness>
            <Readiness done={api.hasToken}>A token is set</Readiness>
         </ul>
         <div className="grid gap-2">
            <p className="text-xs font-medium">Header</p>
            <Code text={header} label="Copy header" />
            <TokenControl workflowId={workflowId} api={api} />
         </div>
         <div className="grid gap-2">
            <p className="text-xs font-medium">Sample request</p>
            <ApiRequest workflowId={workflowId} graph={graph} catalog={catalog} token={api.token} />
         </div>
         <p className="text-muted-foreground text-xs">
            {inputs.length > 0
               ? `The body follows the blocks after this one: ${inputs
                    .map(({ field, what }) => `${field} (${what})`)
                    .join(
                       ', '
                    )}. All are optional; left out, a block uses its own settings or list. The values shown are made up.`
               : 'No block after this one takes anything from a call, so a call with no body starts the workflow.'}
         </p>
      </div>
   )
}
