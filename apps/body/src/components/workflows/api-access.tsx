import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { readableError } from '@/lib/trpc-error'
import { KeyRound, Loader2 } from 'lucide-react'
import { useState } from 'react'

import { trpc } from '../../trpc'
import { createApiUrl } from '../../trpc/config'

// The address another system calls to start this workflow, and its token. The token is shown once.
export const ApiAccess = ({ workflowId }: { workflowId: string }) => {
   const [token, setToken] = useState<string | null>(null)
   const rotate = trpc.workflow.rotateToken.useMutation({ onSuccess: data => setToken(data.token) })
   const address = `${createApiUrl(import.meta.env)}/api/workflows/${workflowId}/run`

   return (
      <div className="grid max-w-3xl gap-3 text-sm">
         <p>
            Send <code>POST {address}</code> with the header <code>Authorization: Bearer &lt;token&gt;</code> and a JSON
            body such as <code>{'{"profiles": ["linkedin.com/in/ada-lovelace"]}'}</code> (or <code>posts</code>,{' '}
            <code>companies</code>; up to 200 links). Add an <code>Idempotency-Key</code> header so a call sent twice
            starts one run. At most 60 calls an hour.
         </p>
         {token ? (
            <Alert>
               <AlertDescription className="grid gap-2">
                  <span>Copy the token now. It is not shown again.</span>
                  <code className="break-all">{token}</code>
               </AlertDescription>
            </Alert>
         ) : null}
         {rotate.error ? <p className="text-destructive">{readableError(rotate.error)}</p> : null}
         <Button
            type="button"
            variant="outline"
            className="justify-self-start"
            disabled={rotate.isPending}
            onClick={() => rotate.mutate({ id: workflowId })}
         >
            {rotate.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />}
            New token (the old one stops working)
         </Button>
      </div>
   )
}
