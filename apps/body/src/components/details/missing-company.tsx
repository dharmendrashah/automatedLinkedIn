import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { readableError } from '@/lib/trpc-error'
import { Building2, ExternalLink, Plus } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { trpc } from '../../trpc'

const searchLink = (name: string) =>
   `https://www.linkedin.com/search/results/companies/?${new URLSearchParams({ keywords: name }).toString()}`

// A position's company that is not in /companies: added from the link the read gave, or, with no link, from the one the owner
// finds and pastes. Adding saves the link only; nothing is read or paid.
export const MissingCompany = ({
   name,
   slug,
   onAdded,
}: {
   name: string
   slug: string | null
   onAdded: (slug: string) => void
}) => {
   const utils = trpc.useUtils()
   const [link, setLink] = useState(slug ? `https://www.linkedin.com/company/${encodeURIComponent(slug)}` : '')
   const [error, setError] = useState('')
   const preview = trpc.linkedInCompany.preview.useMutation()
   const add = trpc.linkedInCompany.import.useMutation()
   const pending = preview.isPending || add.isPending

   const submit = async (event: FormEvent) => {
      event.preventDefault()
      setError('')

      try {
         const { companies } = await preview.mutateAsync({ urls: [link] })
         const [company] = companies

         if (!company) {
            setError('That is not a LinkedIn company link (linkedin.com/company/name).')
            return
         }

         await add.mutateAsync({ companies: [{ url: company.url }] })
         await Promise.all([utils.linkedInCompany.invalidate(), utils.companyPage.invalidate()])
         onAdded(company.slug)
      } catch (failure) {
         setError(failure instanceof Error ? readableError(failure) : 'The company could not be added.')
      }
   }

   return (
      <section className="grid gap-3 rounded-xl border p-4">
         <div className="flex items-center gap-3">
            <span className="bg-muted text-muted-foreground grid size-12 place-items-center rounded-md">
               <Building2 className="size-6" aria-hidden />
            </span>
            <div className="grid">
               <h2 className="text-lg font-semibold">{name}</h2>
               <p className="text-muted-foreground text-sm">
                  {slug
                     ? 'Not in your companies yet.'
                     : 'Not in your companies yet, and the profile read gave no LinkedIn link for it.'}
               </p>
            </div>
         </div>
         <form onSubmit={event => void submit(event)} className="grid gap-2">
            <div className="flex gap-2">
               <Input
                  value={link}
                  onChange={event => setLink(event.target.value)}
                  placeholder="https://www.linkedin.com/company/name"
                  aria-label="LinkedIn company link"
                  maxLength={500}
               />
               <Button type="submit" disabled={pending || link.trim() === ''}>
                  <Plus />
                  Add to companies
               </Button>
            </div>
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
         </form>
         {slug ? null : (
            <Button asChild variant="outline" size="sm" className="justify-self-start">
               <a href={searchLink(name)} target="_blank" rel="noopener noreferrer">
                  <ExternalLink />
                  Find it on LinkedIn
               </a>
            </Button>
         )}
      </section>
   )
}
