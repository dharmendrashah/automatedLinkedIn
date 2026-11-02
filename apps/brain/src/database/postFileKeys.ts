import { PostFiles } from 'core'

import {
   type Graph,
   type PostBlock,
   postBlocksOfText,
   postFilesOf,
   postKey,
   safeFileName,
} from '@automatedLinkedIn/contracts'

// The bucket keys of the files a post holds, shared by the drafts, the posts and the "Write a post" blocks.
export const keysOf = (blocks: PostBlock[]) => postFilesOf(blocks).flatMap(({ key }) => (key ? [key] : []))

// The posts written in the "Write a post" blocks of a graph; their files belong to the graph.
export const postsOf = (graph: Graph) =>
   graph.nodes.flatMap(({ type, config }) =>
      type === 'account.writePost' ? (postBlocksOfText(config.post) ?? []) : []
   )

// The bucket keys of the files a graph holds.
export const filesOf = (graph: Graph) => keysOf(postsOf(graph))

// A key is only taken when it is exactly where this owner's upload of that file ends up, so a post cannot point at anyone else's object.
export const ownsKeys = (userId: string, blocks: PostBlock[]) =>
   postFilesOf(blocks).every(
      ({ id, name, key }) => key === undefined || key === postKey(userId, id, safeFileName(name))
   )

// Files nobody refers to any more are deleted after the owner changed what held them; a failure is logged and never fails the save.
export const dropFiles = async (keys: string[]) => {
   if (keys.length === 0) {
      return
   }

   const failed = await PostFiles.remove(keys).catch(() => keys.length)

   if (failed > 0) {
      console.error(`Post files: ${failed} of ${keys.length} could not be deleted`)
   }
}
