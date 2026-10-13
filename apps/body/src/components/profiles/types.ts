import { type RouterOutputs } from '../../trpc'

export type Profile = RouterOutputs['linkedInProfile']['list']['items'][number]
export type ProfileStatus = Profile['status']
