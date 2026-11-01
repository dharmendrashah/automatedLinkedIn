import { DataServiceError } from 'core/dataClient'

import { type StepErrorCode } from '@automatedLinkedIn/contracts'

import { StepError, WALLET_LOW } from './context'

// The sentence the client reads and the code that explains a failed step (STEP_ERROR_CODES). Raw error text stays in
// the log, and no sentence here names the data supplier.

export const PLAIN_FAILURE = 'Something went wrong in this step. The platform owner has been told.'
const NOT_CONFIGURED = 'Collecting data is not available right now. The platform owner has been told.'
const REFUSED = "The data service refused this step's request. Check the block's settings."
const SLOW = 'The data service did not answer in time.'

export type Failure = { message: string; errorCode: StepErrorCode }

const BY_KIND: Record<DataServiceError['kind'], Failure> = {
   CONFIG: {
      message: NOT_CONFIGURED,
      errorCode: 'DATA_NOT_CONFIGURED',
   },
   BAD_REQUEST: {
      message: REFUSED,
      errorCode: 'DATA_REJECTED',
   },
   UNAVAILABLE: {
      message: SLOW,
      errorCode: 'DATA_UNAVAILABLE',
   },
   BALANCE: {
      message: WALLET_LOW,
      errorCode: 'WALLET_LOW',
   },
}

export const failureOf = (error: unknown): Failure => {
   if (error instanceof StepError) {
      return {
         message: error.message,
         errorCode: error.code,
      }
   }

   if (error instanceof DataServiceError) {
      return BY_KIND[error.kind]
   }

   return {
      message: PLAIN_FAILURE,
      errorCode: 'UNEXPECTED',
   }
}
