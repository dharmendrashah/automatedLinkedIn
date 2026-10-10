export const returnToOf = (state: unknown) => {
   const returnTo = (state as { returnTo?: unknown } | null | undefined)?.returnTo

   return typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/'
}
