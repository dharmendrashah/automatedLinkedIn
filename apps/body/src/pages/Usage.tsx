import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatUsd } from '@/components/workflows/types'
import { downloadFile } from '@/lib/download-file'
import { Download } from 'lucide-react'

import { trpc } from '../trpc'

const thisMonth = () => new Date().toISOString().slice(0, 7)

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
                     The wallet is below {formatUsd(wallet.data?.floorMicros ?? 0)}. Top it up to let workflows run again.
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
      </div>
   )
}
