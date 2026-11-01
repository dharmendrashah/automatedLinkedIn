import { trpc } from '../../trpc'
import { COMPANY_CSV } from '../links/import-csv'
import { type ImportKind, ImportLinksDialog } from '../links/import-links-dialog'
import { COMPANY_READ } from '../links/read-cost'

export const COMPANY_FILLS = 'Fills name, logo, industry, size, website and country.'

const KIND: ImportKind = {
   noun: COMPANY_READ,
   labelKind: 'companies',
   csv: COMPANY_CSV,
   placeholder: 'https://www.linkedin.com/company/elitale',
   csvColumns: 'company_url (or LinkedIn URL), labels (split by ;) and notes',
   fills: COMPANY_FILLS,
   readNow: 'Read their company details now',
   readByDefault: true,
}

// Add companies on /companies (.plan/companies-import-csv.md).
export const AddCompaniesDialog = ({ onShow }: { onShow: (label: string) => void }) => {
   const utils = trpc.useUtils()
   const preview = trpc.linkedInCompany.preview.useMutation()
   const add = trpc.linkedInCompany.import.useMutation()

   return (
      <ImportLinksDialog
         kind={KIND}
         preview={async urls => {
            const { companies, invalid } = await preview.mutateAsync({ urls })

            return {
               items: companies,
               invalid,
            }
         }}
         importBatch={(companies, labels, read) =>
            add.mutateAsync({
               companies,
               labels,
               read,
            })
         }
         onDone={() => Promise.all([utils.linkedInCompany.invalidate(), utils.label.list.invalidate()])}
         onShow={onShow}
      />
   )
}
