import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
   Dialog,
   DialogClose,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { readableError } from '@/lib/trpc-error'
import { Loader2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { type Proxy } from './types'

import { trpc } from '../../trpc'
import { DEFAULT_PROTOCOL, type SupportedProtocol } from './protocols'
import { type ProxyFieldValues, ProxyFields } from './proxy-fields'
import { ProxyResult } from './proxy-result'

const emptyValues: ProxyFieldValues = {
   protocol: DEFAULT_PROTOCOL,
   host: '',
   port: '',
   username: '',
   password: '',
}

export type AddRequest = {
   // The account to add it to, when known (an account's own Add button, or a replacement).
   accountId?: string
   // The proxy being replaced.
   replacing?: Proxy
}

type BodyProps = {
   request: AddRequest
   onClose: () => void
}

const AddBody = ({ request, onClose }: BodyProps) => {
   const utils = trpc.useUtils()
   const accounts = trpc.linkedInAccount.list.useQuery(undefined, { retry: false })
   const [linkedInAccountId, setLinkedInAccountId] = useState(request.accountId ?? '')
   const [values, setValues] = useState(emptyValues)
   const [createdId, setCreatedId] = useState<string | null>(null)

   const create = trpc.proxyServer.create.useMutation({
      onSuccess: created => {
         setCreatedId(created.id)
         void utils.proxyServer.list.invalidate()
         void utils.linkedInAccount.list.invalidate()
      },
   })

   if (createdId) {
      return <ProxyResult proxyId={createdId} replacing={request.replacing ?? null} onDone={onClose} />
   }

   const change = (patch: Partial<ProxyFieldValues>) => setValues(current => ({ ...current, ...patch }))

   const port = Number(values.port)
   const missing = !linkedInAccountId
      ? 'Choose which LinkedIn account this proxy is for.'
      : !values.host.trim()
        ? 'Enter the proxy host.'
        : !values.port || !Number.isInteger(port) || port < 1 || port > 65535
          ? 'Enter a valid port (1-65535).'
          : undefined

   const submit = (event: FormEvent) => {
      event.preventDefault()
      create.mutate({
         linkedInAccountId,
         protocol: values.protocol as SupportedProtocol,
         host: values.host.trim(),
         port,
         username: values.username.trim() || undefined,
         password: values.password || undefined,
      })
   }

   return (
      <form onSubmit={submit} className="grid gap-6">
         <DialogHeader>
            <DialogTitle>{request.replacing ? 'Add a replacement' : 'Add a proxy'}</DialogTitle>
            <DialogDescription>
               {request.replacing
                  ? `This will replace ${request.replacing.host}:${request.replacing.port}. We test the new one first, and you decide afterwards whether to remove the old one.`
                  : 'We test it before saving, so you will see right away whether it works.'}
            </DialogDescription>
         </DialogHeader>

         <details className="bg-muted/40 rounded-lg border p-3 text-sm">
            <summary className="cursor-pointer font-medium">Where do I get these details?</summary>
            <p className="text-muted-foreground mt-2 leading-relaxed">
               You get a proxy from a provider you buy it from. They give you an address (the host, like 203.0.113.9), a
               number (the port), usually a username and password, and tell you whether it is HTTP, HTTPS or SOCKS5. If
               their example starts with http://, choose http://. Copy them into the boxes below. Choose a proxy in the
               country your LinkedIn account normally signs in from.
            </p>
         </details>

         <div className="grid gap-2">
            <Label htmlFor="add-proxy-account">LinkedIn account</Label>
            <Select
               value={linkedInAccountId}
               onValueChange={setLinkedInAccountId}
               disabled={Boolean(request.replacing)}
            >
               <SelectTrigger id="add-proxy-account" className="w-full">
                  <SelectValue placeholder="Choose an account" />
               </SelectTrigger>
               <SelectContent>
                  {accounts.data?.map(account => (
                     <SelectItem key={account.id} value={account.id}>
                        {account.email}
                     </SelectItem>
                  ))}
               </SelectContent>
            </Select>
         </div>

         <ProxyFields idPrefix="add-proxy" values={values} onChange={change} />

         {create.error ? (
            <Alert variant="destructive">
               <AlertTitle>We could not save this proxy</AlertTitle>
               <AlertDescription>{readableError(create.error)}</AlertDescription>
            </Alert>
         ) : null}

         <DialogFooter className="items-center sm:justify-between">
            <p className="text-muted-foreground text-sm">{missing}</p>
            <div className="flex gap-2">
               <DialogClose asChild>
                  <Button type="button" variant="outline">
                     Cancel
                  </Button>
               </DialogClose>
               <Button type="submit" disabled={Boolean(missing) || create.isPending}>
                  {create.isPending ? <Loader2 className="animate-spin" /> : null}
                  Test and save
               </Button>
            </div>
         </DialogFooter>
      </form>
   )
}

type Props = {
   // What is being added; null while the dialog is closed.
   request: AddRequest | null
   onClose: () => void
}

export const AddProxyDialog = ({ request, onClose }: Props) => (
   <Dialog open={request !== null} onOpenChange={open => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
         {request ? <AddBody request={request} onClose={onClose} /> : null}
      </DialogContent>
   </Dialog>
)
