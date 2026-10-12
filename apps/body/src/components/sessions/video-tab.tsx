import { Skeleton } from '@/components/ui/skeleton'

import { type SessionDetail } from './types'

import { Notice } from './recording-gate'
import { useSessionLink } from './use-session-file'

export const VideoTab = ({ session }: { session: SessionDetail }) => {
   const video = useSessionLink(session, 'video.webm')

   if (video.isPending) {
      return <Skeleton className="aspect-video w-full rounded-xl" />
   }

   if (video.error) {
      return <Notice>There is no video for this session. {video.error.message}</Notice>
   }

   return (
      <video
         controls
         preload="metadata"
         src={video.data?.url}
         className="aspect-video w-full rounded-xl border bg-black"
      >
         Your browser cannot play this video.
      </video>
   )
}
