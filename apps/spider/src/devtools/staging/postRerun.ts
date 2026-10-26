import { postBlocksSchema, postFilesOf, taskInputOf } from '@automatedLinkedIn/contracts'

// A post that failed is the only one that may be sent again: one that is sending, posted or unsure may already be on LinkedIn,
// and one that is queued or scheduled may still be sent by the worker.
export const rerunRefusal = (state: string) =>
   state === 'FAILED'
      ? undefined
      : `This post is ${state}, so it is not run again: it may already be on LinkedIn or still be sent by the worker.`

type PostRow = {
   blocks: unknown
   audience: string
   comments: string
}

// The input of the staging run, built the way brain builds it, and where each of its files is in the bucket (by file id).
export const postRerunOf = ({ blocks, audience, comments }: PostRow) => {
   const parsed = postBlocksSchema.safeParse(blocks)

   if (!parsed.success) {
      throw new Error('The post of this run could not be read.')
   }

   const { text, files } = taskInputOf(parsed.data)

   if (text === '' && files.length === 0) {
      throw new Error('The post of this run could not be read.')
   }

   return {
      input: {
         text,
         files,
         audience,
         comments,
      },
      keys: Object.fromEntries(postFilesOf(parsed.data).flatMap(file => (file.key ? [[file.id, file.key]] : []))),
   }
}

type RerunInput = ReturnType<typeof postRerunOf>['input']

// What the owner confirms before it posts for real; the words are shown in their own terminal only.
export const describePost = ({ text, files, audience, comments }: RerunInput) => [
   text === '' ? '(no words)' : text,
   files.length > 0 ? `Files: ${files.map(file => file.name).join(', ')}` : 'No files',
   `Who sees it: ${audience}. Who may comment: ${comments}.`,
]
