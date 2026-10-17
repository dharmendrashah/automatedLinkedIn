// Reading the data service's rows safely: only text, numbers and https links of the expected shape get through.

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
