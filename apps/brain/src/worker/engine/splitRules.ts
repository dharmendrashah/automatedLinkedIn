import { createHash } from 'node:crypto'

// Which side of a "Split people" block an item lands on: a hash of its slug and the block's id, so the same item is on the same side in
// every run of the block. `percent` of the items go on, up to the hash's even spread.
export const onMainSide = (slug: string, nodeId: string, percent: number) =>
   (createHash('sha256').update(`${slug}|${nodeId}|split`).digest().readUInt32BE(0) / 2 ** 32) * 100 < percent
