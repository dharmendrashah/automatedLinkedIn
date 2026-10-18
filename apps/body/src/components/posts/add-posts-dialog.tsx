import { trpc } from '../../trpc'
import { PasteLinksDialog } from '../links/paste-links-dialog'

export const AddPostsDialog = () => {
   const utils = trpc.useUtils()
   const create = trpc.linkedInPost.create.useMutation({
      onSuccess: () => {
         void utils.linkedInPost.list.invalidate()
         void utils.label.list.invalidate()
      },
   })

   return (
      <PasteLinksDialog
         mutation={create}
         kind="posts"
         triggerLabel="Add posts"
         title="Add LinkedIn posts"
         description="Paste the links of the posts you want to work through. Only the link is saved. Mark a post as processed when you are done with it."
         linksLabel="Post links"
         placeholder="https://www.linkedin.com/posts/name_title-activity-1234567890123456789-AbCd"
         hint="One link per line, up to 200. Links like linkedin.com/posts/..., linkedin.com/feed/update/urn:li:activity:... and lnkd.in/p/... are accepted."
         invalidNote="LinkedIn post links"
      />
   )
}
