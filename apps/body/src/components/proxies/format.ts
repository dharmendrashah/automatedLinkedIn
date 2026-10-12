// Headers as saved: an object of name to text. A proxy could send anything back, so anything else is skipped.
export const formatHeaders = (headers: unknown): string => {
   if (typeof headers !== 'object' || headers === null || Array.isArray(headers)) return '(none)'

   const lines = Object.entries(headers)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([name, value]) => `${name}: ${value}`)

   return lines.length > 0 ? lines.join('\n') : '(none)'
}

// A body is untrusted text from the proxy: it is only ever shown as text, never as HTML.
export const formatBody = (body: string | null, truncated: boolean): string => {
   if (!body) return '(empty)'

   if (truncated) return `${body}\n\n(cut after 64 KB)`

   try {
      return JSON.stringify(JSON.parse(body), null, 2)
   } catch {
      return body
   }
}
