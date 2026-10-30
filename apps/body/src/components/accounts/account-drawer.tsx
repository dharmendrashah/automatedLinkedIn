import { floatingDrawer } from '@/components/floating-drawer'
import { Accordion } from '@/components/ui/accordion'
import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Eye, Pause, Pencil, Play, Trash2, UserRound, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { type AccountBrowse } from '../browsing/types'
import { type Account } from './types'

import { type SampleKind } from '../browsing/sample'
import { AccountClient } from './account-client'
import { BrowsingParts, Part } from './drawer-browsing'
import { GettingReady } from './getting-ready'
import { SecretCode } from './secret-code'
import { StatusBadge } from './status-badge'
import { type ItemState, progressText } from './today'
import { TodayChecklist } from './today-checklist'
import { type AccountActions } from './use-account-actions'
import { whyText } from './verdict'

type Props = {
   account: Account | null
   browse: AccountBrowse | undefined
   browseLoading: boolean
   browseError: string | undefined
   // What the account did today; undefined while it is read.
   states: ItemState[] | undefined
   todayLoading: boolean
   todayError: string | undefined
   sample: SampleKind | null
   actions: AccountActions
   accountsWithProxy: Set<string> | undefined
   onClose: () => void
   onActivity: () => void
}

const formatDate = (value: string | Date | null) => (value ? new Date(value).toLocaleDateString() : '—')

const credentialsText = ({ hasPassword, hasTotp, hasSession }: Account) =>
   [hasPassword && 'Password', hasTotp && 'Two-step key', hasSession && 'Browser token'].filter(Boolean).join(', ') ||
   'Nothing saved'

type BodyProps = Omit<Props, 'account' | 'onClose'> & {
   account: Account
   onDirtyChange: (dirty: boolean) => void
   onRequestClose: () => void
}

const Body = ({
   account,
   browse,
   browseLoading,
   browseError,
   states,
   todayLoading,
   todayError,
   sample,
   actions,
   accountsWithProxy,
   onActivity,
   onDirtyChange,
   onRequestClose,
}: BodyProps) => {
   const paused = account.status === 'DISABLED'
   const hasProxy = accountsWithProxy?.has(account.id)

   return (
      <>
         <DrawerHeader className="flex-row items-start justify-between gap-3 border-b text-left">
            <div className="grid min-w-0 gap-1.5">
               <DrawerTitle className="truncate">{account.email}</DrawerTitle>
               <DrawerDescription className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={account.status} message={account.statusMessage} />
                  {browse?.clientLabel ? <Badge variant="outline">{browse.clientLabel}</Badge> : null}
                  <span>Added {formatDate(account.createdAt)}</span>
               </DrawerDescription>
               <Button asChild variant="outline" size="sm" className="w-fit">
                  <Link to={`/accounts/${account.id}`}>
                     <UserRound />
                     View profile
                  </Link>
               </Button>
            </div>
            <Button variant="ghost" size="icon" aria-label="Close the account" onClick={onRequestClose}>
               <X />
            </Button>
         </DrawerHeader>
         <div className="overflow-y-auto px-4 pb-6">
            <Accordion type="multiple" defaultValue={['first', 'checklist', 'state', 'client', 'today', 'limit']}>
               {account.loading && account.loading.percent < 100 ? (
                  <Part value="first" title="Getting your LinkedIn ready" summary={`${account.loading.percent}%`}>
                     <GettingReady loading={account.loading} status={account.status} full />
                  </Part>
               ) : null}
               <Part value="checklist" title="Today's checklist" summary={states ? progressText(states) : undefined}>
                  <TodayChecklist
                     account={account}
                     states={states}
                     loading={todayLoading}
                     error={todayError}
                     actions={actions}
                     hasProxy={hasProxy}
                  />
               </Part>
               <Part value="state" title="State">
                  <div className="grid gap-3">
                     <div className="grid gap-1">
                        <p className="text-sm">{whyText(account, browse)}</p>
                        <p className="text-muted-foreground text-xs">Nothing is posted or sent from here.</p>
                     </div>
                     <p className="text-sm">
                        <span className="text-muted-foreground">Last verified </span>
                        {formatDate(account.lastVerifiedAt)}
                     </p>
                     <Button
                        variant="outline"
                        size="sm"
                        className="w-fit"
                        disabled={actions.busy(account.id)}
                        onClick={() => (paused ? actions.resume([account]) : actions.askPause([account]))}
                     >
                        {paused ? <Play /> : <Pause />}
                        {paused ? 'Resume account' : 'Pause account'}
                     </Button>
                  </div>
               </Part>
               <Part value="client" title="Client">
                  <AccountClient accountId={account.id} />
               </Part>
               <BrowsingParts
                  browse={browse}
                  loading={browseLoading}
                  error={browseError}
                  sample={sample}
                  onActivity={onActivity}
                  onDirtyChange={onDirtyChange}
               />
               <Part value="sign-in" title="Sign-in details" summary={credentialsText(account)}>
                  <div className="grid gap-4">
                     <div className="flex flex-wrap gap-1">
                        {account.hasPassword ? <Badge variant="secondary">Password</Badge> : null}
                        {account.hasTotp ? <Badge variant="secondary">Two-step key</Badge> : null}
                        {account.hasSession ? <Badge variant="secondary">Browser token</Badge> : null}
                     </div>
                     <div className="grid gap-1.5">
                        <p className="text-sm font-medium">Security code</p>
                        <SecretCode key={account.id} account={account} />
                     </div>
                     <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => actions.showSaved(account)}>
                           <Eye />
                           Show saved details
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => actions.askEdit(account)}>
                           <Pencil />
                           Edit
                        </Button>
                     </div>
                  </div>
               </Part>
               <Part value="danger" title="Danger zone" danger>
                  <div className="grid gap-2">
                     <p className="text-sm">
                        Delete this account. Its stored password, two-step key and session are removed. This cannot be
                        undone.
                     </p>
                     <Button
                        variant="destructive"
                        size="sm"
                        className="w-fit"
                        onClick={() => actions.askDelete(account)}
                     >
                        <Trash2 />
                        Delete account
                     </Button>
                  </div>
               </Part>
            </Accordion>
         </div>
      </>
   )
}

// The side drawer of one account: its state and actions, browsing time, sign-in details and, last and apart, Delete. It is the same
// on the list and on the account's own page. Closing it with hours that were changed and not saved asks first.
export const AccountDrawer = ({ account, onClose, ...rest }: Props) => {
   const [dirty, setDirty] = useState(false)
   const [leaving, setLeaving] = useState(false)
   const requestClose = () => (dirty ? setLeaving(true) : onClose())

   return (
      <>
         <Drawer direction="right" open={account !== null} onOpenChange={open => (open ? undefined : requestClose())}>
            <DrawerContent className={floatingDrawer('data-[vaul-drawer-direction=right]:sm:max-w-xl')}>
               {account ? (
                  <Body
                     {...rest}
                     key={account.id}
                     account={account}
                     onDirtyChange={setDirty}
                     onRequestClose={requestClose}
                  />
               ) : (
                  <DrawerHeader>
                     <DrawerTitle>Account</DrawerTitle>
                     <DrawerDescription>No account is open.</DrawerDescription>
                  </DrawerHeader>
               )}
            </DrawerContent>
         </Drawer>
         <AlertDialog open={leaving} onOpenChange={setLeaving}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
                  <AlertDialogDescription>The working hours were changed and not saved.</AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel>Keep editing</AlertDialogCancel>
                  <AlertDialogAction
                     onClick={() => {
                        setDirty(false)
                        onClose()
                     }}
                  >
                     Leave
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </>
   )
}
