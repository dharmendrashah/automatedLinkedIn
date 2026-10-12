import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Eye, KeyRound, Loader2, MoreHorizontal, Pause, Pencil, Play, ScanSearch, Trash2 } from 'lucide-react'

import { type Account } from './types'

import { TestButton } from '../test-button'
import { loginTestBlocker } from './login-test'
import { StatusBadge } from './status-badge'

const formatDate = (value: string | Date | null) => (value ? new Date(value).toLocaleDateString() : '—')

type Props = {
   accounts: Account[] | undefined
   loading: boolean
   error: string | undefined
   busyId: string | undefined
   // The id of the account a login test was just asked for.
   testingId: string | undefined
   // The accounts that have a proxy that works; undefined while the proxies are loading.
   accountsWithProxy: Set<string> | undefined
   onEdit: (account: Account) => void
   onTestLogin: (account: Account) => void
   onReveal: (account: Account) => void
   onTogglePause: (account: Account) => void
   onDelete: (account: Account) => void
}

export const AccountsTable = ({
   accounts,
   loading,
   error,
   busyId,
   testingId,
   accountsWithProxy,
   onEdit,
   onTestLogin,
   onReveal,
   onTogglePause,
   onDelete,
}: Props) => (
   <div className="overflow-hidden rounded-lg border">
      <Table>
         <TableHeader className="bg-muted/50">
            <TableRow>
               <TableHead>Account</TableHead>
               <TableHead>Status</TableHead>
               <TableHead>Credentials</TableHead>
               <TableHead>Last verified</TableHead>
               <TableHead>Added</TableHead>
               <TableHead className="w-44" />
            </TableRow>
         </TableHeader>
         <TableBody>
            {loading ? (
               <TableRow>
                  <TableCell colSpan={6}>
                     <Skeleton className="h-8 w-full" />
                  </TableCell>
               </TableRow>
            ) : null}
            {error ? (
               <TableRow>
                  <TableCell colSpan={6} className="text-destructive h-24 text-center text-sm">
                     {error}
                  </TableCell>
               </TableRow>
            ) : null}
            {accounts?.length === 0 ? (
               <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground h-24 text-center text-sm">
                     <KeyRound className="mx-auto mb-2 size-5" />
                     No LinkedIn accounts yet. Use Add account to store one.
                  </TableCell>
               </TableRow>
            ) : null}
            {accounts?.map(account => (
               <TableRow key={account.id}>
                  <TableCell className="font-medium">{account.email}</TableCell>
                  <TableCell>
                     <StatusBadge status={account.status} message={account.statusMessage} />
                  </TableCell>
                  <TableCell>
                     <span className="flex flex-wrap gap-1">
                        {account.hasPassword ? <Badge variant="secondary">Password</Badge> : null}
                        {account.hasTotp ? <Badge variant="secondary">Two-step key</Badge> : null}
                        {account.hasSession ? <Badge variant="secondary">Browser token</Badge> : null}
                     </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(account.lastVerifiedAt)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(account.createdAt)}</TableCell>
                  <TableCell>
                     <div className="flex items-center justify-end gap-1">
                        <TestButton
                           label="Test login"
                           icon={<ScanSearch />}
                           blocker={loginTestBlocker(account.status, accountsWithProxy?.has(account.id))}
                           busy={testingId === account.id}
                           onClick={() => onTestLogin(account)}
                        />
                        <DropdownMenu>
                           <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={`Actions for ${account.email}`}>
                                 {busyId === account.id ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
                              </Button>
                           </DropdownMenuTrigger>
                           <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => onEdit(account)}>
                                 <Pencil />
                                 Edit credentials
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => onReveal(account)}>
                                 <Eye />
                                 Reveal credentials
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => onTogglePause(account)}>
                                 {account.status === 'DISABLED' ? <Play /> : <Pause />}
                                 {account.status === 'DISABLED' ? 'Resume' : 'Pause'}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" onSelect={() => onDelete(account)}>
                                 <Trash2 />
                                 Remove
                              </DropdownMenuItem>
                           </DropdownMenuContent>
                        </DropdownMenu>
                     </div>
                  </TableCell>
               </TableRow>
            ))}
         </TableBody>
      </Table>
   </div>
)
