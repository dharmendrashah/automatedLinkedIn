import { type LabelKind } from '../labels/labels'

// The input blocks that read the owner's own lists, and which page each reads.
export const INPUT_KINDS = {
   'input.posts': 'posts',
   'input.profiles': 'profiles',
   'input.companies': 'companies',
} as const satisfies Record<string, LabelKind>

export type InputType = keyof typeof INPUT_KINDS

export const isInputType = (type: string): type is InputType => type in INPUT_KINDS
