// An address is linked only when it is https on linkedin.com; anything else is shown as text, never as a link.
export const linkedInHref = (value: string | undefined) => {
   if (!value || !URL.canParse(value)) {
      return undefined
   }

   const { protocol, hostname } = new URL(value)

   return protocol === 'https:' && (hostname === 'linkedin.com' || hostname.endsWith('.linkedin.com'))
      ? value
      : undefined
}
