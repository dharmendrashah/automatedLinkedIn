type IssueLike = { message?: unknown }

// tRPC reports input validation failures as a JSON list of issues; show their sentences instead.
export const readableError = ({ message }: { message: string }) => {
   try {
      const issues: unknown = JSON.parse(message)
      const sentences = Array.isArray(issues)
         ? (issues as IssueLike[])
              .map(issue => issue?.message)
              .filter((text): text is string => typeof text === 'string')
         : []

      return sentences.length ? sentences.join(' ') : message
   } catch {
      return message
   }
}
