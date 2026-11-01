import { useState } from 'react'

import { trpc } from '../../trpc'

// The workflow's token: whether one is set, and the new one for as long as it is shown (it is shown once).
export const useApiToken = (workflowId: string) => {
   const [token, setToken] = useState<string | null>(null)
   const status = trpc.workflow.apiStatus.useQuery({ id: workflowId })
   const rotate = trpc.workflow.rotateToken.useMutation({
      onSuccess: data => {
         setToken(data.token)
         void status.refetch()
      },
   })

   return {
      token,
      status,
      rotate,
      hasToken: Boolean(token) || status.data?.hasToken === true,
   }
}

export type ApiToken = ReturnType<typeof useApiToken>
