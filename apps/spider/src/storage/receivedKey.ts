import { createHash } from 'node:crypto'

import { keptPrefix, safeFileName } from '@automatedLinkedIn/contracts'

// A file of a message of someone else: one folder per message (named by a hash, as a message id can hold any character), one
// stable name per file, so a second read of the same message finds it already there.
export const receivedKey = (userId: string, accountId: string, messageId: string, index: number, name: string) =>
   `${keptPrefix(userId, accountId)}received/${createHash('sha256').update(messageId).digest('hex').slice(0, 32)}/${index}-${safeFileName(name) || 'file'}`
