import { useState } from 'react'

import { mediaSource } from './cdn'

// The source of a third-party picture or video, and the error handler that moves on to the next address to try.
export const useMediaSource = (url: string | null | undefined) => {
   const [failed, setFailed] = useState<{ url: string | null | undefined; count: number }>({
      url,
      count: 0,
   })
   const count = failed.url === url ? failed.count : 0

   return {
      src: mediaSource(url, count),
      onError: () =>
         setFailed({
            url,
            count: count + 1,
         }),
   }
}
