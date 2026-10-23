import { MAX_ATTACHMENT_BYTES, type Message, kindOfName } from '@automatedLinkedIn/contracts'

import { type ReadMessage } from '../../linkedin/messageReader'
import { type TaskContext } from '../defineTask'

// The pictures a browser draws; a vector picture can carry script, so it is never kept.
const EXTENSIONS: Record<string, string> = {
   'image/png': 'png',
   'image/jpeg': 'jpg',
   'image/gif': 'gif',
   'image/webp': 'webp',
}

type Deps = {
   kept?: TaskContext['kept']
   fetchFile?: (url: string, maxBytes: number) => Promise<{ body: Buffer; contentType: string } | undefined>
   warn: (message: string) => void
}

// How many pictures one run may download; the rest wait for the next read, which finds the first ones already kept.
export const PICTURES_PER_RUN = 150

// Keeps the pictures of messages for good (.plan/unibox-keep-messages-and-files.md) and hands the messages back as the contract has
// them: each picture with the place it is kept at and its size, and never the address LinkedIn served it from. A picture already kept
// is not downloaded again. One that cannot be kept stays what it was, a name; nothing here fails the run, and no log line holds a name or an address.
export const keepPictures = async (
   messages: ReadMessage[],
   { kept, fetchFile, warn }: Deps,
   budget: { left: number }
): Promise<Message[]> => {
   const handed: Message[] = []

   for (const message of messages) {
      const attachments: Message['attachments'] = []

      for (const [index, { url, ...attachment }] of message.attachments.entries()) {
         const base = attachment.name ?? 'Picture'
         const key = kept && url ? kept.keyOf(message.id, index, base) : undefined

         if (!kept || !fetchFile || !url || !key || attachment.kind !== 'IMAGE') {
            attachments.push(attachment)

            continue
         }

         try {
            if (await kept.has(key)) {
               attachments.push({
                  ...attachment,
                  key,
               })

               continue
            }

            if (budget.left <= 0) {
               attachments.push(attachment)

               continue
            }

            budget.left -= 1

            const file = await fetchFile(url, MAX_ATTACHMENT_BYTES)
            const extension = file ? EXTENSIONS[file.contentType] : undefined

            if (!file || !extension || file.body.length === 0) {
               attachments.push(attachment)

               continue
            }

            await kept.save(key, file.body, file.contentType)
            attachments.push({
               kind: 'IMAGE',
               name: kindOfName(base) === 'IMAGE' ? base : `${base}.${extension}`,
               key,
               bytes: file.body.length,
            })
         } catch {
            warn('A picture could not be kept.')
            attachments.push(attachment)
         }
      }

      handed.push({
         ...message,
         attachments,
      })
   }

   return handed
}
