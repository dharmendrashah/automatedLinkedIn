// Reading the data service's rows safely: only text, numbers and links of the expected shape get through.

export type Row = Record<string, unknown>

export const text = (value: unknown, max = 300) =>
   typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null

export const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null)

export const rows = (value: unknown) =>
   Array.isArray(value) ? value.filter((item): item is Row => typeof item === 'object' && item !== null) : []

// Images and websites are shown in the browser, so only https links are kept.
export const httpsLink = (value: unknown) => {
   const link = text(value, 1_000)

   return link?.startsWith('https://') ? link : null
}

const urlOf = (value: unknown) => {
   const link = text(value, 1_000)

   try {
      return link
         ? {
              link,
              url: new URL(link),
           }
         : null
   } catch {
      return null
   }
}

// A website opened in a new tab: http or https, nothing else.
export const webLink = (value: unknown) => {
   const found = urlOf(value)

   return found && ['http:', 'https:'].includes(found.url.protocol) ? found.link : null
}

// An https page on LinkedIn itself.
export const linkedInLink = (value: unknown) => {
   const found = urlOf(value)

   return found?.url.protocol === 'https:' && /^(www\.)?linkedin\.com$/.test(found.url.hostname) ? found.link : null
}
