const COMPANY_LINK = /^https:\/\/www\.linkedin\.com\/company\/([^/?#]+)$/

// A position's company in /companies; a read saves every such company there, so its drawer can open it.
export const companySlugOf = (companyUrl: string | null | undefined) => {
   const slug = companyUrl ? COMPANY_LINK.exec(companyUrl)?.[1] : undefined

   return slug ? decodeURIComponent(slug) : null
}
