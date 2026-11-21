import { createHash } from 'node:crypto'

// An item's even spread within a "Split people" block: a hash of its slug and the block's id, so the same item always
// lands in the same place in every run of the block.
const fractionOf = (slug: string, nodeId: string) =>
   createHash('sha256').update(`${slug}|${nodeId}|split`).digest().readUInt32BE(0) / 2 ** 32

// Which side of a block saved before "parts" existed (or still set to the classic 2-part percent) an item lands on.
// `percent` of the items go on, up to the hash's even spread.
export const onMainSide = (slug: string, nodeId: string, percent: number) => fractionOf(slug, nodeId) * 100 < percent

// Which of `parts` about-equal parts an item lands in, for a block set to divide into several.
export const splitBin = (slug: string, nodeId: string, parts: number) =>
   Math.min(parts - 1, Math.floor(fractionOf(slug, nodeId) * parts))
