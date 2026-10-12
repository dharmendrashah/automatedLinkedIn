import { VideoOff } from 'lucide-react'
import { type ReactNode } from 'react'

import { type SessionDetail } from './types'

export const Notice = ({ children }: { children: ReactNode }) => (
   <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center text-sm">
      <span className="bg-muted grid size-10 place-items-center rounded-full">
         <VideoOff className="size-5" />
      </span>
      {children}
   </div>
)

// Says why there is nothing to see, instead of an empty tab: not set up, not recorded, not finished, or expired.
export const RecordingGate = ({ session, children }: { session: SessionDetail; children: ReactNode }) => {
   if (!session.recordingsConfigured) {
      return <Notice>Recordings are not set up on this server.</Notice>
   }

   if (session.recordingExpired) {
      return (
         <Notice>
            This recording expired on {new Date(session.recordingExpiresAt).toLocaleDateString()}. Recordings are only
            kept for a short time.
         </Notice>
      )
   }

   if (!session.hasRecording) {
      return (
         <Notice>
            {session.status === 'IN_PROGRESS'
               ? 'The recording appears here when the session finishes.'
               : 'This session was not recorded. Recording may have been off, or set to keep only failures.'}
         </Notice>
      )
   }

   return children
}
