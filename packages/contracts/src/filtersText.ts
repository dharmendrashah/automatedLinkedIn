import { type z } from 'zod'

// The most text an input block keeps for its filters.
export const FILTERS_TEXT_MAX = 8_000

// The filters an input block keeps as text; empty means none, text that is not valid is refused with `error`.
export const readFiltersText = <S extends z.ZodType>(
   schema: S,
   text: string
): { filters: z.output<S> | null; error: string | null } => {
   if (text.trim() === '') {
      return {
         filters: null,
         error: null,
      }
   }

   try {
      const parsed = schema.safeParse(JSON.parse(text))

      return parsed.success
         ? {
              filters: parsed.data,
              error: null,
           }
         : {
              filters: null,
              error: 'the filters are not valid.',
           }
   } catch {
      return {
         filters: null,
         error: 'the filters are not valid.',
      }
   }
}
