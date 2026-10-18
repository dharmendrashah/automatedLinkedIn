import { trpc } from '../../trpc'
import { PasteLinksDialog } from '../links/paste-links-dialog'

export const AddProfilesDialog = () => {
   const utils = trpc.useUtils()
   const create = trpc.linkedInProfile.create.useMutation({
      onSuccess: () => {
         void utils.linkedInProfile.list.invalidate()
         void utils.label.list.invalidate()
      },
   })

   return (
      <PasteLinksDialog
         mutation={create}
         kind="profiles"
         triggerLabel="Add profiles"
         title="Add LinkedIn profiles"
         description="Paste the links of the people you want to keep track of. Only the link is saved. You can add their details yourself afterwards."
         linksLabel="Profile links"
         placeholder="https://www.linkedin.com/in/ada-lovelace"
         hint="One link per line, up to 200. Only links that look like linkedin.com/in/name are accepted."
         invalidNote="LinkedIn profile links"
      />
   )
}
