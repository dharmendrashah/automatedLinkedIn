import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog'
import { readableError } from '@/lib/trpc-error'
import { Loader2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { type Proxy } from './types'

import { trpc } from '../../trpc'
import { type ProxyFieldValues, ProxyFields } from './proxy-fields'

type FormProps = {
   proxy: Proxy
   onClose: () => void
}

const EditForm = ({ proxy, onClose }: FormProps) => {
   const utils = trpc.useUtils()
   const [values, setValues] = useState<ProxyFieldValues>({
      protocol: proxy.protocol,
      host: proxy.host,
      port: String(proxy.port),
      username: '',
      password: '',
   })

   const update = trpc.proxyServer.update.useMutation({
      onSuccess: () => {
         onClose()
         void utils.proxyServer.list.invalidate()
         void utils.linkedInAccount.list.invalidate()
      },
   })

   const change = (patch: Partial<ProxyFieldValues>) => setValues(current => ({ ...current, ...patch }))

   const port = Number(values.port)
   const missing = !values.host.trim()
      ? 'Enter the proxy host.'
      : !values.port || !Number.isInteger(port) || port < 1 || port > 65535
        ? 'Enter a valid port (1-65535).'
        : undefined

   const submit = (event: FormEvent) => {
      event.preventDefault()
      update.mutate({
         id: proxy.id,
         protocol: values.protocol,
         host: values.host.trim(),
         port,
         username: values.username.trim() || undefined,
         password: values.password || undefined,
      })
   }

   return (
      <form onSubmit={submit} className="grid gap-6">
         <DialogHeader>
            <DialogTitle>Edit proxy</DialogTitle>
            <DialogDescription>
               For {proxy.linkedInAccount.email}. We re-test it when you save. Leave the password blank to keep the one
               already stored.
            </DialogDescription>
         </DialogHeader>

         <ProxyFields idPrefix="edit-proxy" values={values} onChange={change} passwordPlaceholder="Unchanged" />

         {update.error ? (
            <Alert variant="destructive">
               <AlertTitle>We could not save this proxy</AlertTitle>
               <AlertDescription>{readableError(update.error)}</AlertDescription>
            </Alert>
         ) : null}

         <DialogFooter className="items-center sm:justify-between">
            <p className="text-muted-foreground text-sm">{missing}</p>
            <div className="flex gap-2">
               <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
               </Button>
               <Button type="submit" disabled={Boolean(missing) || update.isPending}>
                  {update.isPending ? <Loader2 className="animate-spin" /> : null}
                  Test and save
               </Button>
            </div>
         </DialogFooter>
      </form>
   )
}

type Props = {
   proxy: Proxy | null
   onClose: () => void
}

export const EditProxyDialog = ({ proxy, onClose }: Props) => (
   <Dialog open={Boolean(proxy)} onOpenChange={open => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
         {proxy ? <EditForm key={proxy.id} proxy={proxy} onClose={onClose} /> : null}
      </DialogContent>
   </Dialog>
)
