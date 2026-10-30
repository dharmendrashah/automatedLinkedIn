const COMPANY_LINK = /^https:\/\/www\.linkedin\.com\/company\/([^/?#]+)$/

// The /companies drawer of a position's company; a read saves every such company there, so the drawer can open it.
export const companyPageOf = (companyUrl: string | null | undefined) => {
   const slug = companyUrl ? COMPANY_LINK.exec(companyUrl)?.[1] : undefined

   return slug ? `/companies?${new URLSearchParams({ company: decodeURIComponent(slug) }).toString()}` : null
}
