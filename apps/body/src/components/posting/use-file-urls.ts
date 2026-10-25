import { trpc } from '../../trpc'
import { attachmentFiles } from './draft'
import type { Attachment } from './rules'
import type { Attached } from './use-attachments'

// A link lasts ten minutes (brain); it is asked for again a little before.
const LINK_STALE_MS = 8 * 60 * 1000

// The address to show each file of the attachment from: the copy on this device when there is one, else a signed link to the file
// in the bucket (asked for only for a file that was uploaded).
export const useFileUrls = (attachment: Attachment | undefined, local: ReadonlyMap<string, Attached>) => {
   const files = attachmentFiles(attachment)
   const remote = files.flatMap(({ id, name, key }) => (key && !local.has(id) ? [{ id, name, key }] : []))
   const links = trpc.useQueries(t =>
      remote.map(({ key, name }) =>
         t.postFile.link(
            {
               key,
               name,
            },
            {
               staleTime: LINK_STALE_MS,
               refetchInterval: LINK_STALE_MS,
               retry: false,
            }
         )
      )
   )
   const urls = new Map<string, string>()

   for (const { id } of files) {
      const found = local.get(id)

      if (found) {
         urls.set(id, found.url)
      }
   }

   remote.forEach(({ id }, index) => {
      const url = links[index]?.data?.url

      if (url) {
         urls.set(id, url)
      }
   })

   return urls as ReadonlyMap<string, string>
}
