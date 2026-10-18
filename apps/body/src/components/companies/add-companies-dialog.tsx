import { trpc } from '../../trpc'
import { PasteLinksDialog } from '../links/paste-links-dialog'

export const AddCompaniesDialog = () => {
   const utils = trpc.useUtils()
   const create = trpc.linkedInCompany.create.useMutation({
      onSuccess: () => {
         void utils.linkedInCompany.list.invalidate()
         void utils.label.list.invalidate()
      },
   })

   return (
      <PasteLinksDialog
         mutation={create}
         kind="companies"
         triggerLabel="Add companies"
         title="Add LinkedIn companies"
         description="Paste the links of the companies you want to keep track of. Only the link is saved. You can add their details yourself afterwards."
         linksLabel="Company links"
         placeholder="https://www.linkedin.com/company/elitale"
         hint="One link per line, up to 200. Only links that look like linkedin.com/company/name are accepted."
         invalidNote="LinkedIn company links"
      />
   )
}
