// Why a workflow step ended `FAILED` or done with gaps, in plain words, and what the owner can do about it
// (.plan/workflow-hardening-and-block-details.md). The brain stores only the code on the step; the text lives here so
// it can be reworded without a migration. Never name the data supplier, never show raw error text.

export const STEP_ERROR_CODES = [
   'ICP_DELETED',
   'NO_BLOCK_BEFORE',
   'NEEDS_SELECT_ACCOUNTS',
   'ACCOUNTS_MISSING',
   'ACCOUNTS_SIGNED_OUT',
   'VISITS_STOPPED',
   'POST_UNREADABLE',
   'POST_REFUSED',
   'POST_UNSURE',
   'POST_FAILED',
   'CHILD_START_FAILED',
   'CHILD_ENDED',
   'DATA_NOT_CONFIGURED',
   'DATA_REJECTED',
   'DATA_UNAVAILABLE',
   'WALLET_LOW',
   'SERVICE_BUSY',
   'RUN_UNREADABLE',
   'UNEXPECTED',
   'UNKNOWN',
] as const

export type StepErrorCode = (typeof STEP_ERROR_CODES)[number]

// A button next to a fix: open the block's settings, or go to the page that holds the fix.
export type StepFixAction = 'settings' | 'accounts' | 'icps'

export type StepAdvice = {
   code: StepErrorCode
   title: string
   why: string[]
   fixes: { text: string; action?: StepFixAction }[]
}

type Entry = Omit<StepAdvice, 'code'>

const ADVICE: Record<StepErrorCode, Entry> = {
   ICP_DELETED: {
      title: 'The ideal customer was deleted',
      why: ['This workflow scores people against an ideal customer that no longer exists.'],
      fixes: [
         { text: 'Open the block and pick another ideal customer.', action: 'settings' },
         { text: 'Or create the ideal customer again.', action: 'icps' },
      ],
   },
   NO_BLOCK_BEFORE: {
      title: 'There is no block before it to look at',
      why: ['Task result and Retry judge the block right before them, and nothing is connected before this one.'],
      fixes: [{ text: 'Connect the block you want judged to this one, then run again.' }],
   },
   NEEDS_SELECT_ACCOUNTS: {
      title: 'No accounts were chosen',
      why: ['A LinkedIn action needs "Select accounts" before it to know which accounts may act.'],
      fixes: [{ text: 'Add "Select accounts" before this block and pick at least one account.' }],
   },
   ACCOUNTS_MISSING: {
      title: 'The chosen accounts could not be found',
      why: ['The accounts picked in "Select accounts" were deleted, or belong to someone else.'],
      fixes: [{ text: 'Open "Select accounts" and pick your accounts again.' }],
   },
   ACCOUNTS_SIGNED_OUT: {
      title: 'None of the chosen accounts can act right now',
      why: [
         'LinkedIn signed the accounts out, or asked for a security check.',
         'An account that is paused or still being checked cannot act.',
      ],
      fixes: [
         { text: 'Check the accounts, sign them in again, and wait for the status to turn active.', action: 'accounts' },
         { text: 'Then run the workflow again.' },
      ],
   },
   VISITS_STOPPED: {
      title: 'The visits stopped early',
      why: [
         'LinkedIn limited the account, or the account reached its daily limit.',
         'The accounts may be outside their working hours.',
      ],
      fixes: [
         { text: 'Look at the account status and its browsing time.', action: 'accounts' },
         { text: 'Run again later, or add more accounts to "Select accounts".', action: 'settings' },
      ],
   },
   POST_UNREADABLE: {
      title: 'The post could not be read',
      why: ['The text saved in the block is damaged or was changed in a way the post writer cannot read.'],
      fixes: [{ text: 'Open the block and write the post again.', action: 'settings' }],
   },
   POST_REFUSED: {
      title: 'The post was not allowed',
      why: [
         'An account may post once an hour and three times in 24 hours, and the same words are refused for 7 days.',
         'The account may not be signed in.',
      ],
      fixes: [
         { text: 'Change the words, or wait until the account may post again.', action: 'settings' },
         { text: 'Check the account is signed in.', action: 'accounts' },
      ],
   },
   POST_UNSURE: {
      title: 'It is not clear whether the post went',
      why: ['LinkedIn did not confirm the post in time, so it was not tried again.'],
      fixes: [{ text: 'Check your posts on LinkedIn before posting the same words again.' }],
   },
   POST_FAILED: {
      title: 'The post did not go',
      why: ['LinkedIn did not accept the post, or the account could not open the editor.'],
      fixes: [
         { text: 'Nothing was posted. Check the account is signed in.', action: 'accounts' },
         { text: 'Add a Retry block after this one, or run again later.' },
      ],
   },
   CHILD_START_FAILED: {
      title: 'The other workflow could not start',
      why: [
         'The other workflow is already running, has a problem, or was deleted.',
         'Workflows can start each other only a few in a row.',
      ],
      fixes: [
         { text: 'Open the other workflow and fix what it shows, or wait for its run to end.' },
         { text: 'Pick another workflow in this block.', action: 'settings' },
      ],
   },
   CHILD_ENDED: {
      title: 'The other workflow did not finish well',
      why: ['The workflow this block started failed, was stopped, or ended with nothing to give back.'],
      fixes: [
         { text: 'Open the other workflow and look at its last run.' },
         { text: 'Add a Task result after this block to handle a "no".' },
      ],
   },
   DATA_NOT_CONFIGURED: {
      title: 'Collecting data is not available right now',
      why: ['The platform has no working connection to its data service at the moment.'],
      fixes: [
         { text: 'There is nothing to change in your workflow. The platform owner has been told.' },
         { text: 'Run again a little later.' },
      ],
   },
   DATA_REJECTED: {
      title: 'The data service refused some requests',
      why: [
         'A setting in this block holds something the service cannot use, such as a link that is not valid or an unknown value.',
         'A number may be above what the service allows.',
      ],
      fixes: [
         { text: 'Open the block and check the links, keywords and numbers.', action: 'settings' },
         { text: 'Remove special characters, then run again. Retrying does not help here.' },
      ],
   },
   DATA_UNAVAILABLE: {
      title: 'The data service did not answer',
      why: ['The service was busy or slow, or the answer did not come back in time.'],
      fixes: [
         { text: 'Add a Retry block right after this one so it tries again by itself.' },
         { text: 'Or run again later. Requests that failed were not charged.' },
      ],
   },
   WALLET_LOW: {
      title: 'The data wallet ran low',
      why: ['The shared data wallet fell below its safety floor, so no new requests were started.'],
      fixes: [
         { text: 'What was found so far is kept. Ask the platform owner to top up the wallet.' },
         { text: 'Then run again.' },
      ],
   },
   SERVICE_BUSY: {
      title: 'The data service did not answer for some requests',
      why: ['The service was busy or slow. The requests that failed were not charged.'],
      fixes: [
         { text: 'Add a Retry block right after this one so it tries again by itself.' },
         { text: 'Or run again later. What was found so far is kept.' },
      ],
   },
   RUN_UNREADABLE: {
      title: 'The run could not be read',
      why: ['The copy of the workflow this run started with can no longer be understood, for example after an update.'],
      fixes: [{ text: 'Run the workflow again. If it happens again, send the reference below to support.' }],
   },
   UNEXPECTED: {
      title: 'Something unexpected went wrong',
      why: ['The step stopped for a reason it could not explain. The platform owner has been told.'],
      fixes: [
         { text: 'Run the workflow again.' },
         { text: 'If it fails the same way, send the reference below to support.' },
      ],
   },
   UNKNOWN: {
      title: 'This step did not finish',
      why: ['This step ran before reasons were recorded, so only its short note is known.'],
      fixes: [{ text: 'Run the workflow again to see a full explanation.' }],
   },
}

export const isStepErrorCode = (value: unknown): value is StepErrorCode =>
   typeof value === 'string' && STEP_ERROR_CODES.some(code => code === value)

// The advice for a code, or for `UNKNOWN` when a step has none or an older code.
export const adviceFor = (code: string | null | undefined): StepAdvice => {
   const known = isStepErrorCode(code) ? code : 'UNKNOWN'

   return {
      code: known,
      ...ADVICE[known],
   }
}

// Every piece of advice, for the page to look up by code (the page cannot load this package at runtime).
export const stepErrorCatalog = (): StepAdvice[] => STEP_ERROR_CODES.map(code => adviceFor(code))
