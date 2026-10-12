import { type ScrapeTaskCommand } from '../types'

export class ObjectNotFoundError extends Error {
   public constructor(key: string) {
      super(`No stored object at ${key}`)
      this.name = 'ObjectNotFoundError'
   }
}

// Where spider keeps sessions (read and write), raw results (write) and per-account locks.
export interface ObjectStore {
   put: (key: string, body: string, contentType: string) => Promise<void>
   // Streams a local file to the key, so a video never has to fit in memory.
   upload: (key: string, localPath: string, contentType: string) => Promise<void>
   get: (key: string) => Promise<string>
   // Creates the object only if it does not exist. Resolves to its version, or undefined when it already exists.
   create: (key: string, body: string, contentType: string) => Promise<string | undefined>
   // Reads an object together with the version that was read. Rejects with ObjectNotFoundError.
   getVersioned: (key: string) => Promise<{ body: string; version: string }>
   // Deletes the object only while it still has this version. A missing or changed object is not an error.
   delete: (key: string, version: string) => Promise<void>
}

export const resultKey = ({ task_type: type, task_id: id }: ScrapeTaskCommand) => `results/${type}/${id}.json`

// The account id is validated as path safe by the command schema.
export const sessionKey = (accountId: string) => `sessions/${accountId}/state.json`

export const lockKey = (accountId: string) => `locks/${accountId}.json`

// What the worker concluded about one validation. Holds no secret and no cookie.
export const validationRecordKey = (validationId: string) => `results/validate/${validationId}.json`
