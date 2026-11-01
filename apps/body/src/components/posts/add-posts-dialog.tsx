import { trpc } from '../../trpc'
import { POST_CSV } from '../links/import-csv'
import { type ImportKind, ImportLinksDialog } from '../links/import-links-dialog'
import { POST_READ } from '../links/read-cost'

export const POST_FILLS = 'Fills the author, the text and how many reacted and commented.'

const KIND: ImportKind = {
   noun: POST_READ,
   labelKind: 'posts',
   csv: POST_CSV,
   placeholder: 'https://www.linkedin.com/posts/name_title-activity-1234567890123456789-AbCd',
   csvColumns: 'post_url (or LinkedIn URL) and labels (split by ;)',
   fills: POST_FILLS,
   readNow: 'Get their details now',
   readByDefault: false,
}

// Add posts on /posts (.plan/posts-page-redesign.md): paste or CSV, reviewed first, read only when ticked.
export const AddPostsDialog = ({ onShow }: { onShow: (label: string) => void }) => {
   const utils = trpc.useUtils()
   const preview = trpc.linkedInPost.preview.useMutation()
   const add = trpc.linkedInPost.import.useMutation()

   return (
      <ImportLinksDialog
         kind={KIND}
         preview={async urls => {
            const { posts, invalid } = await preview.mutateAsync({ urls })

            return {
               items: posts,
               invalid,
            }
         }}
         importBatch={(entries, labels, read) =>
            add.mutateAsync({
               posts: entries.map(({ url, labels: own }) => ({
                  url,
                  labels: own,
               })),
               labels,
               read,
            })
         }
         onDone={() => Promise.all([utils.linkedInPost.invalidate(), utils.label.list.invalidate()])}
         onShow={onShow}
      />
   )
}
