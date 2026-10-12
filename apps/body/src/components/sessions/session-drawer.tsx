import { floatingDrawer } from '@/components/floating-drawer'
import { Button } from '@/components/ui/button'
import {
   Drawer,
   DrawerClose,
   DrawerContent,
   DrawerDescription,
   DrawerFooter,
   DrawerHeader,
   DrawerTitle,
} from '@/components/ui/drawer'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { RotateCcw } from 'lucide-react'
import { useState } from 'react'

import { trpc } from '../../trpc'
import { actionLabel, formatDuration, timeAgo } from './describe'
import { LogsTab } from './logs-tab'
import { NetworkTab } from './network-tab'
import { RecordingGate } from './recording-gate'
import { RetryDialog } from './retry-dialog'
import { SessionStatusBadge } from './session-status-badge'
import { StepsTab } from './steps-tab'
import { SummaryTab } from './summary-tab'
import { VideoTab } from './video-tab'

type Props = {
   sessionId: string | null
   onOpen: (id: string) => void
   onClose: () => void
}

// A running session is refreshed every few seconds, so its result appears without a reload.
const REFRESH_MS = 3000

export const SessionDrawer = ({ sessionId, onOpen, onClose }: Props) => {
   const [retrying, setRetrying] = useState(false)
   const detail = trpc.session.get.useQuery(
      { id: sessionId ?? '' },
      {
         enabled: Boolean(sessionId),
         retry: false,
         refetchInterval: query => {
            const session = query.state.data

            return session?.status === 'IN_PROGRESS' && !session.noAnswer ? REFRESH_MS : false
         },
      }
   )
   const session = detail.data

   return (
      <Drawer open={Boolean(sessionId)} onOpenChange={open => (open ? undefined : onClose())} direction="right">
         <DrawerContent className={floatingDrawer('data-[vaul-drawer-direction=right]:sm:max-w-3xl')}>
            <DrawerHeader className="flex-row items-start justify-between gap-3 border-b px-5 py-4">
               <div className="grid gap-1.5">
                  <DrawerTitle className="text-base">
                     {session ? actionLabel(session.kind) : 'Session'}
                  </DrawerTitle>
                  <DrawerDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
                     {session ? (
                        <>
                           <span>{session.linkedInAccount.email}</span>
                           <SessionStatusBadge status={session.status} noAnswer={session.noAnswer} />
                           <span title={new Date(session.startedAt).toLocaleString()}>
                              {timeAgo(new Date(session.startedAt))}
                           </span>
                           <span>· {formatDuration(session.durationMs)}</span>
                        </>
                     ) : (
                        'Loading…'
                     )}
                  </DrawerDescription>
               </div>
               {session ? (
                  <Tooltip>
                     <TooltipTrigger asChild>
                        <span tabIndex={session.retry.allowed ? undefined : 0}>
                           <Button size="sm" disabled={!session.retry.allowed} onClick={() => setRetrying(true)}>
                              <RotateCcw />
                              Try again
                           </Button>
                        </span>
                     </TooltipTrigger>
                     <TooltipContent className="max-w-xs">
                        {session.retry.allowed
                           ? 'Run the same check again, through another proxy of this account.'
                           : session.retry.reason}
                     </TooltipContent>
                  </Tooltip>
               ) : null}
            </DrawerHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
               {detail.isPending && sessionId ? <Skeleton className="h-48 w-full rounded-xl" /> : null}
               {detail.error ? <p className="text-destructive text-sm">{detail.error.message}</p> : null}

               {session ? (
                  <Tabs defaultValue="summary" className="gap-5">
                     <TabsList className="w-full">
                        <TabsTrigger value="summary">Summary</TabsTrigger>
                        <TabsTrigger value="video">Video</TabsTrigger>
                        <TabsTrigger value="steps">Steps</TabsTrigger>
                        <TabsTrigger value="network">Network</TabsTrigger>
                        <TabsTrigger value="logs">Logs</TabsTrigger>
                     </TabsList>

                     <TabsContent value="summary">
                        <SummaryTab session={session} onOpen={onOpen} />
                     </TabsContent>
                     <TabsContent value="video">
                        <RecordingGate session={session}>
                           <VideoTab session={session} />
                        </RecordingGate>
                     </TabsContent>
                     <TabsContent value="steps">
                        <RecordingGate session={session}>
                           <StepsTab session={session} />
                        </RecordingGate>
                     </TabsContent>
                     <TabsContent value="network">
                        <RecordingGate session={session}>
                           <NetworkTab session={session} />
                        </RecordingGate>
                     </TabsContent>
                     <TabsContent value="logs">
                        <RecordingGate session={session}>
                           <LogsTab session={session} />
                        </RecordingGate>
                     </TabsContent>
                  </Tabs>
               ) : null}
            </div>

            <DrawerFooter className="border-t px-5 py-4">
               <DrawerClose asChild>
                  <Button variant="outline">Close</Button>
               </DrawerClose>
            </DrawerFooter>
         </DrawerContent>

         {session ? (
            <RetryDialog session={session} open={retrying} onOpenChange={setRetrying} onStarted={onOpen} />
         ) : null}
      </Drawer>
   )
}
