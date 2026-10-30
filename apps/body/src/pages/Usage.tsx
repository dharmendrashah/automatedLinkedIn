import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { downloadFile } from '@/lib/download-file'
import { ArrowDownUp, Download } from 'lucide-react'
import { useState } from 'react'

import { formatUsd } from '@/components/workflows/types'

import { trpc } from '../trpc'

const thisMonth = () => new Date().toISOString().slice(0, 7)

const ALL = 'all'
const EVERY_CLIENT = 'Every client'

// Owner only: every erasure (for all clients at once) and every export of My network, by client and date. Nothing about anyone.
const AuditView = () => {
   const audit = trpc.people.audit.useQuery()
   const [client, setClient] = useState(ALL)
   const [newestFirst, setNewestFirst] = useState(true)
   const entries = [
      ...(audit.data?.erasures ?? []).map(({ id, createdAt }) => ({
         id,
         createdAt,
         what: 'Erasure',
         client: EVERY_CLIENT,
         rows: '',
         refused: '',
      })),
      ...(audit.data?.exports ?? []).map(entry => ({
         id: entry.id,
         createdAt: entry.createdAt,
         what: 'Export',
         client: entry.client,
         rows: entry.rows.toLocaleString('en'),
         refused: entry.refused ? 'Refused (over 10,000)' : '',
      })),
   ]
      .filter(entry => client === ALL || entry.client === client)
      .sort((a, b) => (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * (newestFirst ? -1 : 1))
   const clients = [...new Set((audit.data?.exports ?? []).map(entry => entry.client))].sort()

   return (
      <Card>
         <CardHeader>
            <CardTitle>Erasures and exports</CardTitle>
            <CardDescription>Who was erased and what was exported from My network, by date.</CardDescription>
         </CardHeader>
         <CardContent className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
               <Select value={client} onValueChange={setClient}>
                  <SelectTrigger size="sm" className="w-48" aria-label="Client">
                     <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                     <SelectItem value={ALL}>All clients</SelectItem>
                     {clients.map(name => (
                        <SelectItem key={name} value={name}>
                           {name}
                        </SelectItem>
                     ))}
                  </SelectContent>
               </Select>
               <Button variant="outline" size="sm" onClick={() => setNewestFirst(!newestFirst)}>
                  <ArrowDownUp />
                  {newestFirst ? 'Newest first' : 'Oldest first'}
               </Button>
            </div>
            {audit.error ? <p className="text-destructive text-sm">{audit.error.message}</p> : null}
            <Table>
               <TableHeader>
                  <TableRow>
                     <TableHead>Date</TableHead>
                     <TableHead>What</TableHead>
                     <TableHead>Client</TableHead>
                     <TableHead>Rows</TableHead>
                     <TableHead>Refused</TableHead>
                  </TableRow>
               </TableHeader>
               <TableBody>
                  {entries.length === 0 ? (
                     <TableRow>
                        <TableCell colSpan={5} className="text-muted-foreground text-sm">
                           Nothing erased or exported yet.
                        </TableCell>
                     </TableRow>
                  ) : null}
                  {entries.map(entry => (
                     <TableRow key={entry.id}>
                        <TableCell>{new Date(entry.createdAt).toLocaleString()}</TableCell>
                        <TableCell>{entry.what}</TableCell>
                        <TableCell>{entry.client}</TableCell>
                        <TableCell>{entry.rows}</TableCell>
                        <TableCell>{entry.refused}</TableCell>
                     </TableRow>
                  ))}
               </TableBody>
            </Table>
         </CardContent>
      </Card>
   )
}

// The platform owner's view: the shared wallet and what each client spent this month.
const OwnerView = () => {
   const wallet = trpc.usage.wallet.useQuery()
   const byClient = trpc.usage.byClient.useQuery({ month: thisMonth() })
   const balance = wallet.data?.wallet?.balanceMicros ?? null
   const low = balance !== null && wallet.data !== undefined && balance < wallet.data.warnMicros
   const stopped = balance !== null && wallet.data !== undefined && balance < wallet.data.floorMicros

   return (
      <Card>
         <CardHeader>
            <CardTitle>Data wallet (platform owner)</CardTitle>
            <CardDescription>
               {balance === null
                  ? 'Not read yet. The worker reads it every 10 minutes.'
                  : `${formatUsd(balance)} left, read ${new Date(wallet.data?.wallet?.checkedAt ?? '').toLocaleString()}.`}
            </CardDescription>
         </CardHeader>
         <CardContent className="grid gap-4">
            {stopped ? (
               <Alert variant="destructive">
                  <AlertTitle>New runs are paused</AlertTitle>
                  <AlertDescription>
                     The wallet is below {formatUsd(wallet.data?.floorMicros ?? 0)}. Top it up to let workflows run
                     again.
                  </AlertDescription>
               </Alert>
            ) : low ? (
               <Alert>
                  <AlertTitle>Top up soon</AlertTitle>
                  <AlertDescription>The wallet is below {formatUsd(wallet.data?.warnMicros ?? 0)}.</AlertDescription>
               </Alert>
            ) : null}
            <Table>
               <TableHeader>
                  <TableRow>
                     <TableHead>Client</TableHead>
                     <TableHead>Data cost this month (UTC)</TableHead>
                  </TableRow>
               </TableHeader>
               <TableBody>
                  {byClient.data?.length === 0 ? (
                     <TableRow>
                        <TableCell colSpan={2} className="text-muted-foreground text-sm">
                           No spend this month yet.
                        </TableCell>
                     </TableRow>
                  ) : null}
                  {byClient.data?.map(client => (
                     <TableRow key={client.email}>
                        <TableCell>{client.name ? `${client.name} (${client.email})` : client.email}</TableCell>
                        <TableCell>{formatUsd(client.amountMicros)}</TableCell>
                     </TableRow>
                  ))}
               </TableBody>
            </Table>
         </CardContent>
      </Card>
   )
}

export const Usage = () => {
   const me = trpc.me.useQuery(undefined, { retry: false })
   const months = trpc.usage.months.useQuery()
   const statement = trpc.usage.statementCsv.useMutation({
      onSuccess: ({ fileName, csv }) => downloadFile(fileName, csv, 'text/csv;charset=utf-8'),
   })

   return (
      <div className="grid w-full gap-4 px-4 lg:px-6">
         <div className="grid gap-1">
            <h2 className="text-lg font-semibold">Usage</h2>
            <p className="text-muted-foreground text-sm">
               What your workflows spent on data, by month (UTC) and by workflow.
            </p>
         </div>

         {statement.error ? <p className="text-destructive text-sm">{statement.error.message}</p> : null}

         <div className="overflow-hidden rounded-lg border">
            <Table>
               <TableHeader className="bg-muted/50">
                  <TableRow>
                     <TableHead>Month</TableHead>
                     <TableHead>By workflow</TableHead>
                     <TableHead>Data cost</TableHead>
                     <TableHead className="w-40" />
                  </TableRow>
               </TableHeader>
               <TableBody>
                  {months.data?.length === 0 ? (
                     <TableRow>
                        <TableCell colSpan={4} className="text-muted-foreground h-20 text-center text-sm">
                           Nothing spent yet.
                        </TableCell>
                     </TableRow>
                  ) : null}
                  {months.data?.map(month => (
                     <TableRow key={month.month}>
                        <TableCell className="font-medium">{month.month}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                           {month.workflows.map(item => `${item.name}: ${formatUsd(item.amountMicros)}`).join(' · ')}
                        </TableCell>
                        <TableCell>{formatUsd(month.totalMicros)}</TableCell>
                        <TableCell>
                           <Button
                              variant="outline"
                              size="sm"
                              disabled={statement.isPending}
                              onClick={() => statement.mutate({ month: month.month })}
                           >
                              <Download />
                              Statement
                           </Button>
                        </TableCell>
                     </TableRow>
                  ))}
               </TableBody>
            </Table>
         </div>

         {me.data?.user?.role === 'ADMIN' ? <OwnerView /> : null}

         <AuditView />
      </div>
   )
}
