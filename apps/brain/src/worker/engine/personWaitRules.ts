import { createHash } from 'node:crypto'

// A stable moment between 0 and `maxSeconds` for one person and block: the same on every run, different from person to person.
export const extraSeconds = (slug: string, nodeId: string, maxSeconds: number) =>
   maxSeconds <= 0
      ? 0
      : Math.floor(
           (createHash('sha256').update(`${slug}|${nodeId}`).digest().readUInt32BE(0) / 2 ** 32) * (maxSeconds + 1)
        )
