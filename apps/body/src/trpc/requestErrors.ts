import { type TRPCLink } from '@trpc/client'
import { observable } from '@trpc/server/observable'
import { logToConsole } from '@automatedLinkedIn/logger/browser'

import type { AppRouter } from '../../../brain/src/trpc/api/router'

type Request = { path: string; context: Record<string, unknown> }

// Every operation of one HTTP request carries the ID that request was sent with.
export const stampCorrelation = (opList: ReadonlyArray<Request>, correlationId: string) => {
   for (const op of opList) {
      op.context.correlationId = correlationId
   }
}

export const reportFailedRequest = (op: Request, error: unknown) => {
   logToConsole('body', 'error', `Request failed: ${op.path}`, {
      code: 'BODY_ERROR',
      correlationId: op.context.correlationId,
      path: op.path,
      error,
   })
}

// Reports a failed request with the ID it was sent with, then passes the error on unchanged.
export const failedRequestLink = (): TRPCLink<AppRouter> => () => ({ op, next }) =>
   observable(observer =>
      next(op).subscribe({
         next: result => observer.next(result),
         error: error => {
            reportFailedRequest(op, error)
            observer.error(error)
         },
         complete: () => observer.complete(),
      })
   )
