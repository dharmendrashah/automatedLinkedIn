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
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
   DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { readableError } from '@/lib/trpc-error'
import { KeyRound, Loader2, TriangleAlert } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { trpc } from '../../trpc'
import { CopyButton } from '../copy-code'
import { type ApiKeyStatus, statusOf } from './api-key-status'

// An account-level API key: calls the whole API as its owner, as an alternative to signing in
// (.plan/api-authentication-and-openapi-docs.md). Several named keys can exist at once; each is revoked on its own.

const EXPIRY_CHOICES = [
   { value: 'never', label: 'Never', days: null },
   { value: '30', label: '30 days', days: 30 },
   { value: '90', label: '90 days', days: 90 },
   { value: '365', label: '1 year', days: 365 },
] as const

const formatDate = (value: string | Date | null) => (value ? new Date(value).toLocaleDateString() : '—')

const STATUS_BADGE: Record<ApiKeyStatus, { label: string; variant: 'secondary' | 'outline' | 'destructive' }> = {
   active: {
      label: 'Active',
      variant: 'secondary',
   },
   expired: {
      label: 'Expired',
      variant: 'outline',
   },
   revoked: {
      label: 'Revoked',
      variant: 'destructive',
   },
}

// Name + optional expiry, shows the new key once with a copy button, then closes.
const CreateKeyDialog = ({ onCreated }: { onCreated: () => void }) => {
   const [open, setOpen] = useState(false)
   const [name, setName] = useState('')
   const [expiry, setExpiry] = useState<(typeof EXPIRY_CHOICES)[number]['value']>('never')
   const create = trpc.apiKey.create.useMutation({
      onSuccess: () => onCreated(),
   })

   const close = () => {
      setOpen(false)
      setName('')
      setExpiry('never')
      create.reset()
   }

   const submit = (event: FormEvent) => {
      event.preventDefault()
      const days = EXPIRY_CHOICES.find(choice => choice.value === expiry)?.days ?? null

      create.mutate({
         name: name.trim(),
         expiresInDays: days,
      })
   }

   return (
      <Dialog
         open={open}
         onOpenChange={next => {
            setOpen(next)

            if (!next) {
               close()
            }
         }}
      >
         <DialogTrigger asChild>
            <Button type="button">
               <KeyRound />
               Create key
            </Button>
         </DialogTrigger>
         <DialogContent>
            {create.data ? (
               <>
                  <DialogHeader>
                     <DialogTitle>Copy your key</DialogTitle>
                     <DialogDescription>It is not shown again after you close this.</DialogDescription>
                  </DialogHeader>
                  <div className="border-warning/40 bg-warning/5 grid gap-2 rounded-md border p-3">
                     <p className="text-warning flex items-center gap-2 text-xs font-medium">
                        <TriangleAlert className="size-4" aria-hidden />
                        Copy it now. It is not shown again.
                     </p>
                     <div className="flex items-center gap-2">
                        <code className="bg-background flex-1 rounded border px-2 py-1.5 font-mono text-xs break-all">
                           {create.data.key}
                        </code>
                        <CopyButton text={create.data.key} label="Copy key" />
                     </div>
                  </div>
                  <DialogFooter>
                     <Button type="button" onClick={close}>
                        Done
                     </Button>
                  </DialogFooter>
               </>
            ) : (
               <form onSubmit={submit}>
                  <DialogHeader>
                     <DialogTitle>Create an API key</DialogTitle>
                     <DialogDescription>It calls the whole API as you, with the same permissions.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                     <div className="grid gap-2">
                        <Label htmlFor="api-key-name">Name</Label>
                        <Input
                           id="api-key-name"
                           value={name}
                           onChange={event => setName(event.target.value)}
                           placeholder="e.g. CI pipeline"
                           maxLength={60}
                           required
                        />
                     </div>
                     <div className="grid gap-2">
                        <Label htmlFor="api-key-expiry">Expires</Label>
                        <Select value={expiry} onValueChange={value => setExpiry(value as typeof expiry)}>
                           <SelectTrigger id="api-key-expiry">
                              <SelectValue />
                           </SelectTrigger>
                           <SelectContent>
                              {EXPIRY_CHOICES.map(choice => (
                                 <SelectItem key={choice.value} value={choice.value}>
                                    {choice.label}
                                 </SelectItem>
                              ))}
                           </SelectContent>
                        </Select>
                     </div>
                     {create.error ? <p className="text-destructive text-sm">{readableError(create.error)}</p> : null}
                  </div>
                  <DialogFooter>
                     <Button type="submit" disabled={create.isPending || name.trim().length === 0}>
                        {create.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />}
                        Create key
                     </Button>
                  </DialogFooter>
               </form>
            )}
         </DialogContent>
      </Dialog>
   )
}

const RevokeButton = ({ id, name, onRevoked }: { id: string; name: string; onRevoked: () => void }) => {
   const revoke = trpc.apiKey.revoke.useMutation({ onSuccess: () => onRevoked() })

   return (
      <AlertDialog>
         <AlertDialogTrigger asChild>
            <Button type="button" variant="outline" size="sm" disabled={revoke.isPending}>
               {revoke.isPending ? <Loader2 className="animate-spin" /> : null}
               Revoke
            </Button>
         </AlertDialogTrigger>
         <AlertDialogContent>
            <AlertDialogHeader>
               <AlertDialogTitle>Revoke "{name}"?</AlertDialogTitle>
               <AlertDialogDescription>
                  It stops authenticating at once. Anything still using it will start failing.
               </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
               <AlertDialogCancel>Keep it</AlertDialogCancel>
               <AlertDialogAction onClick={() => revoke.mutate({ id })}>Revoke</AlertDialogAction>
            </AlertDialogFooter>
         </AlertDialogContent>
      </AlertDialog>
   )
}

export const ApiKeysCard = () => {
   const keys = trpc.apiKey.list.useQuery()
   const refresh = () => void keys.refetch()

   return (
      <Card>
         <CardHeader className="flex-row items-center justify-between">
            <div>
               <CardTitle>API keys</CardTitle>
               <CardDescription>Call the whole API as you, without signing in.</CardDescription>
            </div>
            <CreateKeyDialog onCreated={refresh} />
         </CardHeader>
         <CardContent>
            {keys.isPending ? <Skeleton className="h-16 w-full" /> : null}
            {keys.error ? <p className="text-destructive text-sm">{readableError(keys.error)}</p> : null}
            {keys.data && keys.data.length === 0 ? (
               <p className="text-muted-foreground text-sm">No API keys yet.</p>
            ) : null}
            {keys.data && keys.data.length > 0 ? (
               <Table>
                  <TableHeader>
                     <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Key</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead>Last used</TableHead>
                        <TableHead />
                     </TableRow>
                  </TableHeader>
                  <TableBody>
                     {keys.data.map(key => {
                        const status = statusOf(key)
                        const badge = STATUS_BADGE[status]

                        return (
                           <TableRow key={key.id}>
                              <TableCell>{key.name}</TableCell>
                              <TableCell className="font-mono text-xs">{key.keyPrefix}…</TableCell>
                              <TableCell>
                                 <Badge variant={badge.variant}>{badge.label}</Badge>
                              </TableCell>
                              <TableCell>{formatDate(key.createdAt)}</TableCell>
                              <TableCell>{formatDate(key.expiresAt)}</TableCell>
                              <TableCell>{formatDate(key.lastUsedAt)}</TableCell>
                              <TableCell>
                                 {status === 'revoked' ? null : (
                                    <RevokeButton id={key.id} name={key.name} onRevoked={refresh} />
                                 )}
                              </TableCell>
                           </TableRow>
                        )
                     })}
                  </TableBody>
               </Table>
            ) : null}
         </CardContent>
      </Card>
   )
}
