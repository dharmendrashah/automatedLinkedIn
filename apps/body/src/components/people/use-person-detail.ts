import { pollWhile } from '@/components/details/read-status'

import { trpc } from '../../trpc'

// The person's detail, refreshed while a read runs. The drawer's card and Profile tab share it through the query cache.
export const usePersonDetail = (slug: string) =>
   trpc.person.detail.useQuery(
      { slug },
      {
         retry: false,
         refetchInterval: query => pollWhile(query.state.data?.read),
      }
   )
