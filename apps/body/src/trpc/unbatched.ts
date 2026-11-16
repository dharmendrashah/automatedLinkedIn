// An operation sent on its own, not in the batch: `useQuery(..., { trpc: { context: { skipBatch: true } } })`.
export const isUnbatched = (op: { context: Record<string, unknown> }) => op.context.skipBatch === true
