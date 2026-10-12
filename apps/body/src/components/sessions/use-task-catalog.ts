import { trpc } from '../../trpc'

const CATALOG_STALE_MS = 5 * 60 * 1000

// What the worker announced: how each task and its verdicts are named. Nothing waits for it; labels fall back to readable names.
export const useTaskCatalog = () =>
   trpc.task.catalog.useQuery(undefined, {
      retry: false,
      staleTime: CATALOG_STALE_MS,
   }).data
