import { type RouterOutputs } from '../../trpc'

export type Post = RouterOutputs['linkedInPost']['list']['items'][number]
export type PostStatus = Post['status']
