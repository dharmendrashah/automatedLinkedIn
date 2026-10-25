import { useMemo } from 'react'

import { type DaySession, type DayUsage, type UseMixPart } from './types'

import { trpc } from '../../trpc'
import { type SampleKind, sampleDays, sampleMix, sampleSessions } from './sample'

type Loaded<T> = { data: T | undefined; loading: boolean; error: string | undefined }

// The days of one account for the year graph: brain's, or invented with `?browse=`.
export const useBrowseYear = (
   accountId: string,
   year: number | undefined,
   kind: SampleKind | null,
   now: Date
): Loaded<DayUsage[]> => {
   const query = trpc.browse.year.useQuery({ accountId, year }, { enabled: kind === null, retry: false })
   const sample = useMemo(() => (kind ? sampleDays(kind, accountId, now) : undefined), [kind, accountId, now])

   return kind
      ? { data: sample, loading: false, error: undefined }
      : { data: query.data, loading: query.isPending, error: query.error?.message }
}

// The sessions of one day, for the layer opened from the graph.
export const useBrowseDay = (
   accountId: string,
   usage: DayUsage | undefined,
   kind: SampleKind | null
): Loaded<DaySession[]> => {
   const real = kind === null && usage !== undefined && usage.seconds > 0
   const query = trpc.browse.day.useQuery({ accountId, day: usage?.day ?? '' }, { enabled: real, retry: false })

   if (kind) {
      return {
         data: usage && usage.seconds > 0 ? sampleSessions(accountId, usage) : undefined,
         loading: false,
         error: undefined,
      }
   }

   return {
      data: query.data,
      loading: real && query.isPending,
      error: query.error?.message,
   }
}

// Where today's time went.
export const useBrowseMix = (accountId: string, usedSeconds: number, kind: SampleKind | null): Loaded<UseMixPart[]> => {
   const query = trpc.browse.mix.useQuery({ accountId }, { enabled: kind === null, retry: false })

   return kind
      ? { data: sampleMix(usedSeconds), loading: false, error: undefined }
      : { data: query.data, loading: query.isPending, error: query.error?.message }
}
