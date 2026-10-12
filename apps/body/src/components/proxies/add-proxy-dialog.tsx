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
   DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { readableError } from '@/lib/trpc-error'
import { Loader2, Plus } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { trpc } from '../../trpc'
import { type ProxyFieldValues, ProxyFields } from './proxy-fields'

const emptyValues: ProxyFieldValues = {
   protocol: 'HTTP',
   host: '',
   port: '',
   username: '',
   password: '',
}

export const AddProxyDialog = () => {
   const utils = trpc.useUtils()
   const accounts = trpc.linkedInAccount.list.useQuery(undefined, { retry: false })
   const [open, setOpen] = useState(false)
   const [linkedInAccountId, setLinkedInAccountId] = useState('')
   const [values, setValues] = useState(emptyValues)

   const create = trpc.proxyServer.create.useMutation({
      onSuccess: () => {
         setOpen(false)
         void utils.proxyServer.list.invalidate()
         void utils.linkedInAccount.list.invalidate()
      },
   })

   const onOpenChange = (next: boolean) => {
      setOpen(next)

      if (!next) {
         setLinkedInAccountId('')
         setValues(emptyValues)
         create.reset()
      }
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
         protocol: values.protocol,
         host: values.host.trim(),
         port,
         username: values.username.trim() || undefined,
         password: values.password || undefined,
      })
   }

   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogTrigger asChild>
            <Button>
               <Plus />
               Add a proxy
            </Button>
         </DialogTrigger>
         <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <form onSubmit={submit} className="grid gap-6">
               <DialogHeader>
                  <DialogTitle>Add a proxy</DialogTitle>
                  <DialogDescription>
                     We test it before saving, so you will see right away whether it works.
                  </DialogDescription>
               </DialogHeader>

               <div className="grid gap-2">
                  <Label htmlFor="add-proxy-account">LinkedIn account</Label>
                  <Select value={linkedInAccountId} onValueChange={setLinkedInAccountId}>
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
         </DialogContent>
      </Dialog>
   )
}
